/**
 * Agent MCP config contract.
 *
 * The web editor stores the concise `{ name: server }` shape. Each runtime
 * adapter is responsible for projecting that shape into its native protocol;
 * this module is the single parser/normalizer used at those boundaries.
 */

const ENV_REF_RE = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;
const SECRET_KEY_RE = /(api[_-]?key|token|secret|password|passwd|credential|private[_-]?key|authorization|cookie)/i;

export function isSensitiveConfigKey(key: string): boolean {
  return SECRET_KEY_RE.test(key.trim());
}

export function parseEnvReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(ENV_REF_RE);
  return match?.[1] ?? null;
}

export function resolveEnvReference(value: unknown, env: NodeJS.ProcessEnv = process.env): unknown {
  const name = parseEnvReference(value);
  return name ? env[name] ?? '' : value;
}

function resolveEnvRefs(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof value === 'string') return resolveEnvReference(value, env);
  if (Array.isArray(value)) return value.map((child) => resolveEnvRefs(child, env));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveEnvRefs(child, env)]),
    );
  }
  return value;
}

/** Parse both the web-editor object and legacy Claude `{mcpServers: ...}`. */
export function parseMcpServers(raw: string | null | undefined): Record<string, unknown> {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed === 'null') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`parse mcp_config json: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('mcp_config must be a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  const servers = record.mcpServers ?? record;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error('mcp_config servers must be a JSON object');
  }
  return servers as Record<string, unknown>;
}

/** Find literal secret values before an Agent config is persisted. */
export function findUnsafeMcpSecretPaths(value: unknown, path = 'mcpServers'): string[] {
  const unsafe: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((child, index) => unsafe.push(...findUnsafeMcpSecretPaths(child, `${path}[${index}]`)));
    return unsafe;
  }
  if (!value || typeof value !== 'object') return unsafe;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isSensitiveConfigKey(key)) {
      // New MCP writes may retain only an explicit host-env reference beneath
      // a sensitive key. Scalars, null, arrays, and nested objects can all
      // carry a credential and must be rejected rather than relying on the
      // legacy cleanup scanner to repair them later.
      if (typeof child !== 'string' || !parseEnvReference(child)) unsafe.push(childPath);
      continue;
    }
    unsafe.push(...findUnsafeMcpSecretPaths(child, childPath));
  }
  return unsafe;
}

export function validateMcpConfig(raw: string | null | undefined):
  | { ok: true; canonical: string }
  | { ok: false; error: string } {
  try {
    const servers = parseMcpServers(raw);
    const unsafe = findUnsafeMcpSecretPaths(servers);
    if (unsafe.length > 0) {
      return {
        ok: false,
        error: `MCP 配置含明文敏感值（${unsafe.slice(0, 3).join(', ')}）；请改用 \${env:NAME} 引用`,
      };
    }
    return { ok: true, canonical: JSON.stringify(servers) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function resolveMcpServersEnv(
  servers: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  return resolveEnvRefs(servers, env) as Record<string, unknown>;
}

export type McpMissingEnvReference = {
  path: string;
  key: string;
  envRef: string;
};

/**
 * Preflight env references before a backend writes its task-local MCP config.
 * Sensitive keys are required credentials; optional references are surfaced to
 * the worker as safe warnings and retain the legacy best-effort resolver.
 */
export function inspectMcpEnvReferences(
  servers: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): {
  missingRequiredRefs: McpMissingEnvReference[];
  missingOptionalRefs: McpMissingEnvReference[];
} {
  const missingRequiredRefs: McpMissingEnvReference[] = [];
  const missingOptionalRefs: McpMissingEnvReference[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      const envRef = parseEnvReference(child);
      if (envRef) {
        const resolved = env[envRef];
        const missing = resolved === undefined || (isSensitiveConfigKey(key) && !resolved.trim());
        if (missing) {
          const item = { path: childPath, key, envRef };
          (isSensitiveConfigKey(key) ? missingRequiredRefs : missingOptionalRefs).push(item);
        }
        continue;
      }
      visit(child, childPath);
    }
  };
  visit(servers, 'mcpServers');
  return { missingRequiredRefs, missingOptionalRefs };
}

/**
 * Project a persisted config back to the web API without ever returning a
 * literal secret. Legacy rows may predate the env-ref contract, so this is
 * intentionally defensive and redacts by key rather than trusting validation
 * at write time alone.
 */
export function redactMcpConfig(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const input = parsed as Record<string, unknown>;
    const hasWrapper = Object.prototype.hasOwnProperty.call(input, 'mcpServers');
    const servers = parseMcpServers(raw);
    const redacted = redactMcpValue(servers);
    return JSON.stringify(hasWrapper ? { mcpServers: redacted } : redacted);
  } catch {
    // Malformed legacy config is not useful to the editor and must not be
    // echoed back as an opaque string (it could contain credentials).
    return null;
  }
}

function redactMcpValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return key && isSensitiveConfigKey(key) && !parseEnvReference(value)
      ? '[redacted]'
      : value;
  }
  if (Array.isArray(value)) return value.map((child) => redactMcpValue(child, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        redactMcpValue(child, childKey),
      ]),
    );
  }
  return value;
}
