import type { AgentEnvVar } from '@ma/shared';
import { isSensitiveConfigKey, parseEnvReference } from './mcp-config.js';

/** Agent env rows are persisted as values only for non-sensitive settings. */
export function isSensitiveEnvKey(key: string): boolean {
  return isSensitiveConfigKey(key);
}

export type AgentEnvConfigResult =
  | { ok: true; rows: AgentEnvVar[] }
  | { ok: false; error: string };

export function normalizeAgentEnvVars(input: AgentEnvVar[] | null | undefined): AgentEnvConfigResult {
  if (input == null) return { ok: true, rows: [] };
  const seen = new Set<string>();
  const rows: AgentEnvVar[] = [];
  for (const row of input) {
    const key = row.key.trim();
    if (!key || seen.has(key)) {
      return { ok: false, error: `环境变量 key 为空或重复: ${key || '(empty)'}` };
    }
    seen.add(key);
    const envRef = row.envRef?.trim() || undefined;
    if (envRef && !parseEnvReference(`\${env:${envRef}}`)) {
      return { ok: false, error: `环境变量引用名非法: ${envRef}` };
    }
    if (isSensitiveEnvKey(key) && row.value.trim() && !envRef) {
      return { ok: false, error: `${key} 不能保存明文值，请填写 envRef` };
    }
    rows.push({ key, value: envRef ? '' : row.value, ...(envRef ? { envRef } : {}) });
  }
  return { ok: true, rows };
}

