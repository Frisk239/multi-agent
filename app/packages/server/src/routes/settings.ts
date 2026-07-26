// bu04 G0：只读环境诊断（不写密钥）
// settings-run-health / wiki-auto / ADR0003 cwd 持久化
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import {
  SetWorkspaceCwdInput,
  type CliDiagnosticItem,
  type CliStatusBadge,
  type SettingsAutomationHealth,
  type SettingsCheck,
  type SettingsDiagnosticsResponse,
  type SettingsMemoryHealth,
  type SettingsOverall,
  type SettingsRunHealth,
  type SettingsStatusResponse,
  type SettingsWikiHealth,
} from '@ma/shared';
import { db } from '../db/client.js';
import {
  agentRuns,
  agents,
  issues,
  automationRules,
  automationRuns,
  memoryItems,
  wikiIngestJobs,
} from '../db/schema.js';
import {
  STALE_QUEUED_MS,
  STALE_RUNNING_MS,
  STALE_SWEEP_INTERVAL_MS,
  getIssueIdleMs,
  getIssueWallTimeoutMs,
} from '../orchestration/stale-runs.js';
import { allBackends } from '../runtime/registry.js';
import { memoryManager } from '../memory/manager.js';
import {
  readDbRootPath,
  resolveWorkspaceCwd,
  setWorkspaceRootPath,
} from '../workspace-cwd.js';

function envNonEmpty(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim());
}

function buildRunHealth(now = Date.now()): SettingsRunHealth {
  const rows = db
    .select()
    .from(agentRuns)
    .where(
      inArray(agentRuns.status, [
        'queued',
        'waiting_local_directory',
        'running',
      ]),
    )
    .all();

  let queued = 0;
  let running = 0;
  let oldestQueuedAgeMs: number | null = null;
  let oldestRunningAgeMs: number | null = null;
  let oldestRunningHeartbeatAgeMs: number | null = null;
  let runningNearStale = 0;
  let queuedNearStale = 0;
  const issueIdleMs = getIssueIdleMs();
  const issueWallTimeoutMs = getIssueWallTimeoutMs();
  const chatNear = Math.floor(STALE_RUNNING_MS * 0.7);
  const issueNear =
    issueIdleMs > 0 ? Math.floor(issueIdleMs * 0.7) : Number.POSITIVE_INFINITY;
  const queueNear = Math.floor(STALE_QUEUED_MS * 0.7);

  for (const row of rows) {
    if (row.status === 'queued') {
      queued += 1;
      const age = Math.max(0, now - row.createdAt);
      if (oldestQueuedAgeMs === null || age > oldestQueuedAgeMs) oldestQueuedAgeMs = age;
      if (age >= queueNear) queuedNearStale += 1;
    } else if (row.status === 'running') {
      running += 1;
      const started = row.startedAt ?? row.createdAt;
      const runAge = Math.max(0, now - started);
      if (oldestRunningAgeMs === null || runAge > oldestRunningAgeMs) {
        oldestRunningAgeMs = runAge;
      }
      const hb = row.lastHeartbeatAt ?? row.startedAt ?? row.createdAt;
      const hbAge = Math.max(0, now - hb);
      if (
        oldestRunningHeartbeatAgeMs === null ||
        hbAge > oldestRunningHeartbeatAgeMs
      ) {
        oldestRunningHeartbeatAgeMs = hbAge;
      }
      const kind = (row.kind as string) ?? 'issue';
      const near = kind === 'chat' ? chatNear : issueNear;
      if (Number.isFinite(near) && hbAge >= near) runningNearStale += 1;
    }
  }

  return {
    active: { total: queued + running, queued, running },
    oldestQueuedAgeMs,
    oldestRunningAgeMs,
    oldestRunningHeartbeatAgeMs,
    thresholds: {
      staleRunningMs: STALE_RUNNING_MS,
      issueIdleMs,
      issueWallTimeoutMs,
      staleQueuedMs: STALE_QUEUED_MS,
      sweepIntervalMs: STALE_SWEEP_INTERVAL_MS,
    },
    atRisk: { runningNearStale, queuedNearStale },
  };
}

function buildWikiHealth(llmConfigured: boolean): SettingsWikiHealth {
  const rows = db
    .select({ status: wikiIngestJobs.status })
    .from(wikiIngestJobs)
    .all();
  let dead = 0;
  let pending = 0;
  let running = 0;
  for (const r of rows) {
    if (r.status === 'dead') dead += 1;
    else if (r.status === 'pending') pending += 1;
    else if (r.status === 'running') running += 1;
  }
  return { dead, pending, running, llmConfigured };
}

function buildAutomationHealth(): SettingsAutomationHealth {
  const rows = db.select().from(automationRules).all();
  let enabled = 0;
  for (const r of rows) {
    if (r.enabled) enabled += 1;
  }
  // 失败规则：存在 status=failed 的 automation_run（与 list API failCount 同源）
  const failRuns = db
    .select()
    .from(automationRuns)
    .where(eq(automationRuns.status, 'failed'))
    .all();
  const failedRuleIds = new Set(failRuns.map((r) => r.ruleId));
  let lastFailedAtMs: number | null = null;
  for (const r of failRuns) {
    if (lastFailedAtMs === null || r.createdAt > lastFailedAtMs) {
      lastFailedAtMs = r.createdAt;
    }
  }
  return {
    total: rows.length,
    enabled,
    failedRules: failedRuleIds.size,
    lastFailedAt:
      lastFailedAtMs != null ? new Date(lastFailedAtMs).toISOString() : null,
  };
}

function buildMemoryHealth(): SettingsMemoryHealth {
  const st = memoryManager.getStatus();
  const rows = db.select({ text: memoryItems.text, createdAt: memoryItems.createdAt }).from(memoryItems).all();
  let ambient = 0;
  let latestAtMs: number | null = null;
  for (const r of rows) {
    if (r.text.includes('[ambient:') || r.text.startsWith('ambient:')) ambient += 1;
    if (latestAtMs === null || r.createdAt > latestAtMs) latestAtMs = r.createdAt;
  }
  const total = rows.length;
  return {
    provider: st.provider,
    available: st.available,
    backend: st.backend,
    total,
    ambient,
    curated: Math.max(0, total - ambient),
    latestAt: latestAtMs != null ? new Date(latestAtMs).toISOString() : null,
  };
}

export async function buildSettingsStatus(): Promise<SettingsStatusResponse> {
  const checks: SettingsCheck[] = [];

  // --- cwd（env > DB root_path）---
  // A3：默认隔离执行，未配置工作区 = warn（不拦派活）；
  // 仅 MA_ISSUE_USE_WORKSPACE_CWD=1 时缺/坏 path = error 硬闸。
  const resolved = resolveWorkspaceCwd();
  const persistedPath = readDbRootPath();
  const forceWorkspaceCwd =
    process.env.MA_ISSUE_USE_WORKSPACE_CWD === '1' ||
    process.env.MA_ISSUE_USE_WORKSPACE_CWD === 'true';
  // F7：每项 error/warn 必带可点 href + actionLabel（Settings 诊断行一键去修）
  if (!resolved.configured) {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: forceWorkspaceCwd ? 'error' : 'warn',
      detail: forceWorkspaceCwd
        ? '未配置工作区路径（已启用 MA_ISSUE_USE_WORKSPACE_CWD，派活硬闸）'
        : '未配置工作区路径（默认隔离目录可开工，不拦派活）',
      hint: forceWorkspaceCwd
        ? '在「代码仓库 / 路径」保存绝对路径，或设置 MA_WORKSPACE_CWD；也可关闭 MA_ISSUE_USE_WORKSPACE_CWD 改回隔离默认'
        : '可选：保存工作区路径供 Wiki/skills；Issue 默认用 ~/.multi-agent 隔离目录；绑 project.localPath 则进真仓',
      href: '/settings?tab=workspace',
      actionLabel: '保存工作区路径',
    });
  } else if (!resolved.exists) {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: forceWorkspaceCwd ? 'error' : 'warn',
      detail: forceWorkspaceCwd
        ? `路径不存在: ${resolved.path}（已启用工作区 cwd，派活硬闸）`
        : `路径不存在: ${resolved.path}（默认隔离仍可开工）`,
      hint: '检查路径是否有效，或重新在「代码仓库 / 路径」保存',
      href: '/settings?tab=workspace',
      actionLabel: '修正路径',
    });
  } else {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: 'ok',
      detail: forceWorkspaceCwd
        ? `${resolved.path}（来源: ${resolved.source} · 已启用工作区 cwd）`
        : `${resolved.path}（来源: ${resolved.source} · 默认隔离；project 可绑本机目录）`,
      href: '/settings?tab=workspace',
      actionLabel: '查看路径',
    });
  }

  // --- runtimes ---
  for (const b of allBackends()) {
    const d = await b.detect();
    if (!d.installed) {
      checks.push({
        id: `runtime:${b.id}`,
        label: b.label,
        status: 'error',
        detail: '未安装或不在 PATH',
        hint: '安装对应 CLI 或检查 PATH 后重启 server',
        href: '/runtimes',
        actionLabel: '运行时探测',
      });
    } else if (!d.version) {
      checks.push({
        id: `runtime:${b.id}`,
        label: b.label,
        status: 'warn',
        detail: d.path ? `已安装（无版本）: ${d.path}` : '已安装（无版本）',
        href: '/runtimes',
        actionLabel: '查看探测',
      });
    } else {
      checks.push({
        id: `runtime:${b.id}`,
        label: b.label,
        status: 'ok',
        detail: `${d.version}${d.path ? ` · ${d.path}` : ''}`,
        href: '/runtimes',
        actionLabel: '运行时',
      });
    }
  }

  // --- wiki llm ---
  const wikiOk = envNonEmpty('WIKI_LLM_API_KEY');
  checks.push({
    id: 'wiki_llm',
    label: 'Wiki LLM',
    status: wikiOk ? 'ok' : 'error',
    detail: wikiOk
      ? `已配置（provider=${process.env.WIKI_LLM_PROVIDER ?? 'openai'}）`
      : '未配置 WIKI_LLM_API_KEY',
    hint: wikiOk
      ? null
      : '在 server 环境配置 WIKI_LLM_API_KEY 后重启；修好后到 Wiki dead 队列重试',
    href: wikiOk ? '/wiki' : '/settings?tab=health',
    actionLabel: wikiOk ? '打开 Wiki' : '配置引导',
  });

  // --- embedding ---
  const embedOk =
    envNonEmpty('EMBEDDING_API_KEY') || envNonEmpty('OPENAI_API_KEY');
  const memMode = (process.env.MEMORY_PROVIDER ?? 'sqlite-text').toLowerCase();
  const embedStatus = embedOk
    ? 'ok'
    : memMode === 'pgvector'
      ? 'error'
      : 'warn';
  checks.push({
    id: 'embedding',
    label: 'Embedding',
    status: embedStatus,
    detail: embedOk
      ? '已配置 EMBEDDING_API_KEY 或 OPENAI_API_KEY'
      : '未配置 embedding 密钥',
    hint:
      embedStatus === 'ok'
        ? null
        : memMode === 'pgvector'
          ? 'MEMORY_PROVIDER=pgvector 时需要 embedding 密钥'
          : 'sqlite-text 可无 embedding；切换 pgvector 前请配置',
    href: '/memory',
    actionLabel: '记忆页',
  });

  // --- memory ---
  const mem = memoryManager.getStatus();
  checks.push({
    id: 'memory',
    label: '记忆层',
    status: mem.available ? 'ok' : 'error',
    detail: mem.available
      ? `provider=${mem.provider ?? 'unknown'}`
      : `不可用（provider=${mem.provider ?? 'null'}）`,
    href: '/memory',
    actionLabel: '打开记忆',
  });

  // --- server ---
  const port = Number(process.env.PORT ?? 3001);
  checks.push({
    id: 'server',
    label: '服务',
    status: 'ok',
    detail: `监听端口 ${port}`,
    href: '/runs?status=active',
    actionLabel: '在途运行',
  });

  const errors = checks.filter((c) => c.status === 'error').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const cwdBlocked = checks.some((c) => c.id === 'cwd' && c.status === 'error');
  const overall = cwdBlocked
    ? 'blocked'
    : errors > 0 || warnings > 0
      ? 'degraded'
      : 'ok';

  return {
    overall,
    summary: { errors, warnings },
    checks,
    secrets: {
      wikiLlmConfigured: wikiOk,
      embeddingConfigured: embedOk,
    },
    server: { port },
    runHealth: buildRunHealth(),
    wikiHealth: buildWikiHealth(wikiOk),
    automationHealth: buildAutomationHealth(),
    memoryHealth: buildMemoryHealth(),
    cwd: {
      path: resolved.path,
      source: resolved.source,
      exists: resolved.exists,
      configured: resolved.configured,
      persistedPath,
    },
  };
}

export async function buildSettingsDiagnostics(): Promise<SettingsDiagnosticsResponse> {
  const resolved = resolveWorkspaceCwd();
  const persistedPath = readDbRootPath();

  let writable = false;
  if (resolved.configured && resolved.exists && resolved.path) {
    try {
      await access(resolved.path, constants.R_OK | constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
  }

  let auditMessage = '';
  if (!resolved.configured) {
    auditMessage = '工作区 CWD 未配置：默认采用 ~/.multi-agent 隔离目录（派活不硬闸，推荐在「代码仓库/路径」配置绝对路径）。';
  } else if (!resolved.exists) {
    auditMessage = `工作区 CWD 路径不存在 (${resolved.path})：请确认路径是否有效。`;
  } else if (!writable) {
    auditMessage = `工作区 CWD 权限警告 (${resolved.path})：目录存在但无法进行写入测试，请检查读写权限。`;
  } else {
    auditMessage = `工作区 CWD 审计通过 (${resolved.path})：路径有效且可读写 (来源: ${resolved.source})。`;
  }

  const cliMeta: Record<
    string,
    { name: string; capabilities: string[]; recommendation: string }
  > = {
    'claude-code': {
      name: 'Claude Code',
      capabilities: [
        'Subprocess Execution',
        'Streaming JSON Output',
        'Session Resume (--resume)',
        'Model Selection',
      ],
      recommendation:
        'Anthropic 官方 CLI 适配器，推荐用于复杂多文件重构、长程工程任务与高级工具调用。',
    },
    claude: {
      name: 'Claude Code',
      capabilities: [
        'Subprocess Execution',
        'Streaming JSON Output',
        'Session Resume (--resume)',
        'Model Selection',
      ],
      recommendation:
        'Anthropic 官方 CLI 适配器，推荐用于复杂多文件重构、长程工程任务与高级工具调用。',
    },
    opencode: {
      name: 'Opencode',
      capabilities: [
        'Subprocess Execution',
        'ANSI Text Normalizer',
        'Variant/Thinking Control',
        'Model Selection',
      ],
      recommendation:
        '开源 CLI 适配器，适用于快速代码生成、极速响应与基础工程补全任务。',
    },
    cursor: {
      name: 'Cursor Agent',
      capabilities: [
        'Cursor CLI Process',
        'File System Operations',
        'Headless Subprocess Execution',
      ],
      recommendation:
        'Cursor IDE 衍生 CLI，适合本地代码审查、编辑策略同步与极简修改。',
    },
    pi: {
      name: 'Pi SDK',
      capabilities: [
        'In-Process SDK',
        'Subprocess Fallback',
        'Tool Call Registry',
        'Zero-Latency Loop',
      ],
      recommendation:
        '轻量级进程内 SDK 引擎，适合单文件修改、极短上下文任务与高频交互。',
    },
    grok: {
      name: 'Grok Build',
      capabilities: [
        'ACP JSON-RPC Stdio',
        'Print Mode (-p)',
        'Effort Level Control',
      ],
      recommendation:
        'xAI Grok CLI 适配器，适合跨领域多模态与快速模式匹配分析。',
    },
  };

  const cliBackends: CliDiagnosticItem[] = [];

  for (const b of allBackends()) {
    const d = await b.detect();
    const meta = cliMeta[b.id] ?? {
      name: b.label,
      capabilities: ['Subprocess Execution'],
      recommendation: '通用 CLI 适配器。',
    };

    let status: CliStatusBadge = 'not_found';
    let errorMsg: string | undefined = undefined;

    if (!d.installed) {
      status = 'not_found';
      errorMsg = `${meta.name} 命令未在系统 PATH 或对应环境变量中找到。`;
    } else if (!d.version) {
      status = 'warning';
      errorMsg = `${meta.name} 已发现路径 (${d.path})，但无法提取版本号。`;
    } else {
      status = 'ready';
    }

    cliBackends.push({
      id: b.id === 'claude-code' ? 'claude' : b.id,
      name: meta.name,
      installed: d.installed,
      path: d.path,
      version: d.version,
      status,
      capabilities: meta.capabilities,
      usageRecommendation: meta.recommendation,
      error: errorMsg,
    });
  }

  const readyCount = cliBackends.filter((c) => c.status === 'ready').length;
  const warningCount = cliBackends.filter((c) => c.status === 'warning').length;
  const notFoundCount = cliBackends.filter((c) => c.status === 'not_found').length;
  const permissionIssueCount = cliBackends.filter((c) => c.status === 'permission_issue').length;
  const totalDetected = cliBackends.filter((c) => c.installed).length;

  let overallStatus: SettingsOverall = 'ok';
  if (readyCount === 0 || (resolved.configured && !writable && resolved.exists)) {
    overallStatus = 'blocked';
  } else if (readyCount < cliBackends.length || !resolved.configured || !resolved.exists) {
    overallStatus = 'degraded';
  }

  return {
    overallStatus,
    timestamp: new Date().toISOString(),
    cliBackends,
    cwdAudit: {
      path: resolved.path,
      source: resolved.source,
      configured: resolved.configured,
      exists: resolved.exists,
      writable,
      persistedPath,
      auditMessage,
    },
    summary: {
      totalDetected,
      readyCount,
      warningCount,
      notFoundCount,
      permissionIssueCount,
    },
  };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/status', async () => buildSettingsStatus());
  app.get('/api/settings/diagnostics', async () => buildSettingsDiagnostics());
  app.get('/api/settings/health', async () => buildSettingsDiagnostics());

  // POST /api/settings/workspace-cwd —— 持久化本机路径（非密钥）并立即生效
  app.post('/api/settings/workspace-cwd', async (req, reply) => {
    const parsed = SetWorkspaceCwdInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'invalid body', details: parsed.error.flatten() });
    }
    const res = setWorkspaceRootPath(parsed.data.path);
    if (!res.ok) return reply.status(400).send({ success: false, error: res.error  });
    return {
      ok: true as const,
      cwd: {
        path: res.resolved.path,
        source: res.resolved.source,
        exists: res.resolved.exists,
        configured: res.resolved.configured,
        persistedPath: readDbRootPath(),
      },
    };
  });

  // P2-B：Inbox 偏好
  app.get('/api/settings/inbox-prefs', async () => {
    const { readInboxPrefs } = await import('../orchestration/inbox-prefs.js');
    const prefs = readInboxPrefs();
    const envForce =
      process.env.MA_INBOX_NOTIFY_SUCCESS === '1' ||
      process.env.MA_INBOX_NOTIFY_SUCCESS === 'true';
    return {
      ...prefs,
      envForcesSuccess: envForce,
      effectiveNotifyIssueSuccess: envForce || prefs.notifyIssueSuccess,
    };
  });

  app.put('/api/settings/inbox-prefs', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { writeInboxPrefs } = await import('../orchestration/inbox-prefs.js');
    const patch: Record<string, unknown> = {};
    if (typeof body.notifyIssueSuccess === 'boolean') patch.notifyIssueSuccess = body.notifyIssueSuccess;
    if (Array.isArray(body.notifyTypes)) patch.notifyTypes = body.notifyTypes;
    if (Array.isArray(body.notifySeverities)) patch.notifySeverities = body.notifySeverities;
    
    const prefs = writeInboxPrefs(patch);
    return { ok: true as const, ...prefs };
  });

  // E4：隔离 CLI 目录列表（~/.multi-agent/run-workspaces|chat-sessions）
  app.get('/api/settings/isolated-workspaces', async () => {
    const { listIsolatedWorkspaces } = await import(
      '../orchestration/isolated-workspaces.js'
    );
    const entries = listIsolatedWorkspaces();
    return {
      rootHint: '~/.multi-agent/{run-workspaces,chat-sessions}',
      count: entries.length,
      entries,
    };
  });

  // E4：清理隔离目录（禁 project_local）
  app.post('/api/settings/isolated-workspaces/cleanup', async (req, reply) => {
    const body = (req.body ?? {}) as {
      ids?: string[];
      olderThanDays?: number;
    };
    if (
      (!body.ids || body.ids.length === 0) &&
      !(body.olderThanDays != null && body.olderThanDays > 0)
    ) {
      return reply.status(400).send({ success: false, error: '需要 ids[] 或 olderThanDays>0',
      });
    }
    const { cleanupIsolatedWorkspaces } = await import(
      '../orchestration/isolated-workspaces.js'
    );
    const result = cleanupIsolatedWorkspaces({
      ids: body.ids,
      olderThanDays: body.olderThanDays,
    });
    return { ok: true as const, ...result };
  });

  // Slice D: Settings 活体探针（TODO: 接真实 runtime 进程探测）
  app.get('/api/settings/live-probes', async () => {
    return {
      activeCount: 0,
      probes: [],
      _stub: true,
      _note: '活体探针尚未接入真实进程探测，当前返回空数组',
    };
  });
  // GAP-02: 首启 Onboarding 状态 API
  app.get('/api/settings/onboarding-status', async () => {
    const cwd = resolveWorkspaceCwd();
    const agentCount = db.select().from(agents).all().length;
    const issueCount = db.select().from(issues).all().length;

    let installedRuntimesCount = 0;
    for (const b of allBackends()) {
      const d = await b.detect();
      if (d.installed) installedRuntimesCount++;
    }

    const hasCwd = Boolean(cwd.configured && cwd.exists);
    const hasAgents = agentCount > 0;
    const hasIssues = issueCount > 0;
    const hasRuntimes = installedRuntimesCount > 0;

    return {
      hasCwd,
      hasRuntimes,
      hasAgents,
      hasIssues,
      installedRuntimesCount,
      agentCount,
      issueCount,
      completed: hasCwd && hasAgents && hasRuntimes,
    };
  });
}
