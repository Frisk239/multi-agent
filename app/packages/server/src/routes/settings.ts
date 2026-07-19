// bu04 G0：只读环境诊断（不写密钥）
// settings-run-health / wiki-auto / ADR0003 cwd 持久化
import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import {
  SetWorkspaceCwdInput,
  type SettingsAutomationHealth,
  type SettingsCheck,
  type SettingsMemoryHealth,
  type SettingsRunHealth,
  type SettingsStatusResponse,
  type SettingsWikiHealth,
} from '@ma/shared';
import { db } from '../db/client.js';
import {
  agentRuns,
  automationRules,
  automationRuns,
  memoryItems,
  wikiIngestJobs,
} from '../db/schema.js';
import {
  STALE_QUEUED_MS,
  STALE_RUNNING_MS,
  STALE_SWEEP_INTERVAL_MS,
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
    .where(inArray(agentRuns.status, ['queued', 'running']))
    .all();

  let queued = 0;
  let running = 0;
  let oldestQueuedAgeMs: number | null = null;
  let oldestRunningAgeMs: number | null = null;
  let oldestRunningHeartbeatAgeMs: number | null = null;
  let runningNearStale = 0;
  let queuedNearStale = 0;
  const runNear = Math.floor(STALE_RUNNING_MS * 0.7);
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
      if (hbAge >= runNear) runningNearStale += 1;
    }
  }

  return {
    active: { total: queued + running, queued, running },
    oldestQueuedAgeMs,
    oldestRunningAgeMs,
    oldestRunningHeartbeatAgeMs,
    thresholds: {
      staleRunningMs: STALE_RUNNING_MS,
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
  const resolved = resolveWorkspaceCwd();
  const persistedPath = readDbRootPath();
  if (!resolved.configured) {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: 'error',
      detail: '未配置工作区路径',
      hint: '在下方表单保存绝对路径，或设置环境变量 MA_WORKSPACE_CWD',
      href: null,
    });
  } else if (!resolved.exists) {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: 'error',
      detail: `路径不存在: ${resolved.path}`,
      hint: '检查路径是否有效，或重新在 Settings 保存',
      href: null,
    });
  } else {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: 'ok',
      detail: `${resolved.path}（来源: ${resolved.source}）`,
      href: null,
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
        hint: '安装对应 CLI 或检查 PATH',
        href: '/runtimes',
      });
    } else if (!d.version) {
      checks.push({
        id: `runtime:${b.id}`,
        label: b.label,
        status: 'warn',
        detail: d.path ? `已安装（无版本）: ${d.path}` : '已安装（无版本）',
        href: '/runtimes',
      });
    } else {
      checks.push({
        id: `runtime:${b.id}`,
        label: b.label,
        status: 'ok',
        detail: `${d.version}${d.path ? ` · ${d.path}` : ''}`,
        href: '/runtimes',
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
    hint: wikiOk ? null : 'ingest/query/lint 需要 WIKI_LLM_API_KEY',
    href: '/wiki',
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
  });

  // --- server ---
  const port = Number(process.env.PORT ?? 3001);
  checks.push({
    id: 'server',
    label: '服务',
    status: 'ok',
    detail: `监听端口 ${port}`,
    href: null,
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

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/status', async () => buildSettingsStatus());

  // POST /api/settings/workspace-cwd —— 持久化本机路径（非密钥）并立即生效
  app.post('/api/settings/workspace-cwd', async (req, reply) => {
    const parsed = SetWorkspaceCwdInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid body', details: parsed.error.flatten() });
    }
    const res = setWorkspaceRootPath(parsed.data.path);
    if (!res.ok) return reply.status(400).send({ error: res.error });
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
}
