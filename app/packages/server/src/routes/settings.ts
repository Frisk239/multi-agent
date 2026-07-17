// bu04 G0：只读环境诊断（不写 env、不回传密钥）
import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { SettingsCheck, SettingsStatusResponse } from '@ma/shared';
import { allBackends } from '../runtime/registry.js';
import { memoryManager } from '../memory/manager.js';

function envNonEmpty(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim());
}

export async function buildSettingsStatus(): Promise<SettingsStatusResponse> {
  const checks: SettingsCheck[] = [];

  // --- cwd ---
  const cwd = process.env.MA_WORKSPACE_CWD?.trim() || null;
  if (!cwd) {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: 'error',
      detail: '未配置 MA_WORKSPACE_CWD',
      hint: '启动 server 前设置环境变量 MA_WORKSPACE_CWD 为项目根目录',
      href: null,
    });
  } else if (!existsSync(cwd)) {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: 'error',
      detail: `路径不存在: ${cwd}`,
      hint: '检查 MA_WORKSPACE_CWD 是否指向有效目录',
      href: null,
    });
  } else {
    checks.push({
      id: 'cwd',
      label: '工作区目录',
      status: 'ok',
      detail: cwd,
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
  };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/status', async () => buildSettingsStatus());
}
