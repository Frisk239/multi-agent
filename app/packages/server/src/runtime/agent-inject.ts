// G3-4b：agent.env_vars / agent.custom_args（DB 存 JSON 字符串）→ ExecutionInput 注入对象。
// 解析失败一律诚实降级为 null（不因单条坏数据砸掉 run）；空对象/空数组同 null。

import { isSensitiveEnvKey } from './agent-config.js';

const ENV_REF_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type MissingRequiredAgentEnvRef = {
  key: string;
  envRef: string | null;
};

export type AgentEnvResolution =
  | {
      ok: true;
      envVars: Record<string, string> | null;
      missingOptionalRefs: Array<{ key: string; envRef: string }>;
    }
  | {
      ok: false;
      error: string;
      missingRequiredRefs: MissingRequiredAgentEnvRef[];
      missingOptionalRefs: Array<{ key: string; envRef: string }>;
    };

/**
 * Resolve persisted Agent env rows only at launch time.
 *
 * Sensitive rows are configuration requirements: a missing/empty host value,
 * a missing envRef, or a malformed envRef must stop the run before a CLI is
 * spawned. Non-sensitive references retain the older lenient behavior and are
 * simply omitted when the host does not define them.
 */
export function resolveAgentEnvVarsForExecution(
  raw: string | null,
  env: NodeJS.ProcessEnv = process.env,
): AgentEnvResolution {
  if (!raw) return { ok: true, envVars: null, missingOptionalRefs: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: true, envVars: null, missingOptionalRefs: [] };
    const out: Record<string, string> = {};
    const missingOptionalRefs: Array<{ key: string; envRef: string }> = [];
    const missingRequiredRefs: MissingRequiredAgentEnvRef[] = [];
    let invalidRequiredKey: string | null = null;

    for (const item of parsed) {
      if (!item || typeof item.key !== 'string' || !item.key.trim()) continue;
      const key = item.key.trim();
      const sensitive = isSensitiveEnvKey(key);
      const rawEnvRef = typeof item.envRef === 'string' ? item.envRef.trim() : '';
      const envRef = rawEnvRef && ENV_REF_NAME_RE.test(rawEnvRef) ? rawEnvRef : null;

      if (rawEnvRef && !envRef) {
        if (sensitive) invalidRequiredKey ??= key;
        continue;
      }
      if (envRef) {
        const resolved = env[envRef];
        if (sensitive && (!resolved || !resolved.trim())) {
          missingRequiredRefs.push({ key, envRef });
          continue;
        }
        if (resolved !== undefined) out[key] = resolved;
        else missingOptionalRefs.push({ key, envRef });
        continue;
      }
      if (sensitive) {
        // Legacy literals are deliberately never re-injected. Treat a row
        // without a usable reference as a configuration error rather than
        // letting the CLI silently authenticate as an anonymous user.
        missingRequiredRefs.push({ key, envRef: null });
        continue;
      }
      if (typeof item.value === 'string') out[key] = item.value;
    }

    if (invalidRequiredKey) {
      return {
        ok: false,
        error: `敏感环境变量 ${invalidRequiredKey} 的 envRef 无效；请重新设置宿主环境变量引用`,
        missingRequiredRefs: [{ key: invalidRequiredKey, envRef: null }],
        missingOptionalRefs,
      };
    }
    if (missingRequiredRefs.length > 0) {
      const first = missingRequiredRefs[0]!;
      return {
        ok: false,
        error: first.envRef
          ? `宿主环境缺少 ${first.envRef}（供 ${first.key} 使用），未启动 CLI`
          : `敏感环境变量 ${first.key} 缺少 envRef；请在 Agent 设置中引用宿主环境变量`,
        missingRequiredRefs,
        missingOptionalRefs,
      };
    }
    return {
      ok: true,
      envVars: Object.keys(out).length ? out : null,
      missingOptionalRefs,
    };
  } catch {
    // Keep the historic malformed-JSON compatibility behavior. The explicit
    // cleanup route can clear it; no raw content is ever handed to a CLI.
    return { ok: true, envVars: null, missingOptionalRefs: [] };
  }
}

export function parseAgentEnvVars(raw: string | null): Record<string, string> | null {
  const resolved = resolveAgentEnvVarsForExecution(raw);
  return resolved.ok ? resolved.envVars : null;
}

export function parseAgentCustomArgs(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.map(String) : null;
  } catch {
    return null;
  }
}
