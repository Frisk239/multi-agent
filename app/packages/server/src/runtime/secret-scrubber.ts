/**
 * G8-5：Run transcript 的高置信密钥 scrubber。
 *
 * 这是防止本机 CLI / tool 回显意外进入本地 transcript、DB 与 WS 的纵深防御，
 * 不是密码学保证，也不是通用 PII 过滤器。规则刻意只覆盖高置信形状：
 * - `Bearer <token>` 认证值；
 * - 足够长的 `sk-` / `sk-or-` token；
 * - AWS access key 的 `AKIA` 形状；
 * - 明确的 api_key / token / secret / password / authorization 赋值。
 *
 * 短 `sk`、普通代码引用（如 `process.env.API_KEY`）以及 URL path 不会被当作
 * token。替换值固定为 `[redacted]`，不保留长度、前后缀或任何可复用片段。
 * `StreamSecretScrubber` 与 stream-scrubber.ts 的 memory/think 围栏状态机独立：
 * 它只负责在流式 chunk 边界不泄露可能尚未结束的凭据。
 */

export const REDACTED_SECRET = '[redacted]';

const SENSITIVE_FIELD =
  '(?:x[_-]?api[_-]?(?:key|token)|api[_-]?(?:key|token)|(?:access[_-]?)?token|secret|password|authorization)';
const TOKEN_START_BOUNDARY = '(^|[^A-Za-z0-9_./])';

// Bearer scheme 本身就是认证上下文；不把短 token 作为普通文本放行。
const BEARER_TOKEN_RE = /\bBearer[ \t]+[A-Za-z0-9._~+/=-]+/gi;
// Require a substantial body and a non-URL boundary so ordinary `sk` / docs URL
// fragments do not become a broad false-positive rule.
const SK_TOKEN_RE = new RegExp(
  `${TOKEN_START_BOUNDARY}(sk(?:-or)?-[A-Za-z0-9][A-Za-z0-9._~-]{19,})(?=$|[^A-Za-z0-9._~-])`,
  'gi',
);
const AWS_ACCESS_KEY_RE = new RegExp(
  `${TOKEN_START_BOUNDARY}(AKIA[0-9A-Z]{16})(?=$|[^A-Za-z0-9])`,
  'g',
);
// Captures the non-word boundary and assignment prefix separately so both remain
// readable while only the value is replaced. Quoted JSON/YAML style values keep
// their quote pair for a useful, syntactically valid transcript.
const SENSITIVE_ASSIGNMENT_RE = new RegExp(
  `(^|[^A-Za-z0-9_])((?:["']?${SENSITIVE_FIELD}["']?)\\s*[:=]\\s*)("(?:\\\\.|[^"\\\\\\r\\n])*"|'(?:\\\\.|[^'\\\\\\r\\n])*'|[^\\s,;}\\]\\r\\n]+)`,
  'gi',
);

const PARTIAL_PREFIXES = [
  'bearer',
  'sk-',
  'sk-or-',
  'akia',
  'api_key',
  'api-key',
  'apikey',
  'x_api_key',
  'x-api-key',
  'xapikey',
  'x_api_token',
  'x-api-token',
  'xapitoken',
  'access_token',
  'access-token',
  'accesstoken',
  'token',
  'secret',
  'password',
  'authorization',
] as const;
const MAX_PARTIAL_PREFIX_LENGTH = Math.max(...PARTIAL_PREFIXES.map((prefix) => prefix.length));
/** A candidate without a delimiter may be large; never let a hostile CLI chunk grow memory forever. */
export const MAX_HELD_SECRET_CHARS = 4_096;

// A completed assignment at the end has no delimiter yet. Keep it until another
// chunk proves a boundary, then redact it before publishing.
const TRAILING_BEARER_RE = new RegExp(
  `${TOKEN_START_BOUNDARY}(Bearer[ \\t]+[A-Za-z0-9._~+/=-]*)$`,
  'i',
);
const TRAILING_SK_RE = new RegExp(
  `${TOKEN_START_BOUNDARY}(sk(?:-or)?-[A-Za-z0-9._~-]*)$`,
  'i',
);
const TRAILING_AWS_RE = new RegExp(
  `${TOKEN_START_BOUNDARY}(AKIA[0-9A-Z]*)$`,
  'i',
);
const TRAILING_ASSIGNMENT_RE = new RegExp(
  `(^|[^A-Za-z0-9_./?&])((?:["']?${SENSITIVE_FIELD}["']?)\\s*[:=]\\s*(?:"(?:\\\\.|[^"\\\\\\r\\n])*"|'(?:\\\\.|[^'\\\\\\r\\n])*'|[^\\s,;}\\]\\r\\n]*)$)`,
  'i',
);

/** Scrub one complete text value. The result never carries token fragments. */
export function scrubSecrets(text: string): string {
  if (!text) return text;

  return text
    .replace(BEARER_TOKEN_RE, REDACTED_SECRET)
    .replace(SK_TOKEN_RE, (_match, boundary: string) => `${boundary}${REDACTED_SECRET}`)
    .replace(AWS_ACCESS_KEY_RE, (_match, boundary: string) => `${boundary}${REDACTED_SECRET}`)
    .replace(
      SENSITIVE_ASSIGNMENT_RE,
      (match: string, boundary: string, assignment: string, value: string) => {
        if (isClearlyCodeReference(value)) return match;
        return `${boundary}${assignment}${redactedValue(value)}`;
      },
    );
}

/**
 * Deep-clone JSON-like tool input/output and scrub every string without mutating
 * the object supplied by a runtime. Unknown non-plain objects, cycles and very
 * deep values fail closed instead of giving JSON.stringify a chance to reveal a
 * custom/raw value later.
 */
export function scrubSecretValue<T>(value: T): T {
  return scrubValue(value, new WeakSet<object>(), 0) as T;
}

/**
 * Adapter helper: for structured tool results, scrub the full value *before*
 * stringification and 4k truncation. This preserves the required
 * scrub -> truncate order even when the original secret spans the old cutoff.
 */
export function scrubAndTruncateToolResult(value: unknown, limit = 4_000): string {
  const safeValue = scrubSecretValue(value);
  if (typeof safeValue === 'string') return safeValue;
  try {
    return scrubSecrets(JSON.stringify(safeValue ?? '')).slice(0, limit);
  } catch {
    // Do not interpolate a serialization error: custom toJSON / Error messages
    // may themselves contain the tool's raw output.
    return '{"error":true,"reason":"工具输出无法安全序列化"}';
  }
}

/**
 * Stateful text scrubber for live deltas/logs. It withholds a potential token
 * prefix/body until a delimiter arrives (or flush), so prefix/body/terminator
 * split across chunks can never publish raw pieces separately.
 */
export class StreamSecretScrubber {
  private held = '';
  private discardingUntilDelimiter = false;

  reset(): void {
    this.held = '';
    this.discardingUntilDelimiter = false;
  }

  feed(text: string): string {
    if (!text) return '';
    if (this.discardingUntilDelimiter) {
      const delimiterAt = findSafeDelimiter(text);
      if (delimiterAt === -1) return '';
      this.discardingUntilDelimiter = false;
      // Feed the delimiter + following safe text through the normal state so a
      // token immediately after it still receives ordinary prefix detection.
      return this.feed(text.slice(delimiterAt));
    }
    const combined = this.held + text;
    const holdAt = findTrailingSensitiveStart(combined);
    if (holdAt === -1) {
      this.held = '';
      return scrubSecrets(combined);
    }
    const stable = scrubSecrets(combined.slice(0, holdAt));
    // Check the index before slicing/assigning so the stateful buffer itself
    // never grows beyond the fixed cap, even for one oversized CLI fragment.
    if (combined.length - holdAt > MAX_HELD_SECRET_CHARS) {
      // We have already withheld every candidate byte. Emit one stable marker,
      // then discard until a delimiter proves the candidate has ended.
      this.held = '';
      this.discardingUntilDelimiter = true;
      return `${stable}${REDACTED_SECRET}`;
    }
    this.held = combined.slice(holdAt);
    return stable;
  }

  flush(): string {
    if (this.discardingUntilDelimiter) {
      this.discardingUntilDelimiter = false;
      return '';
    }
    const tail = this.held;
    this.held = '';
    return scrubSecrets(tail);
  }
}

function scrubValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === 'string') return scrubSecrets(value);
  if (value == null || typeof value !== 'object') return value;
  if (depth >= 32 || seen.has(value)) return REDACTED_SECRET;

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, seen, depth + 1));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return REDACTED_SECRET;

  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    // A structured sensitive field is an explicit assignment even when a
    // provider decoded it as number/object rather than a string.
    copy[key] = isSensitiveObjectKey(key) ? REDACTED_SECRET : scrubValue(nested, seen, depth + 1);
  }
  return copy;
}

function redactedValue(value: string): string {
  const first = value[0];
  if ((first === '"' || first === "'") && value.length >= 2 && value.at(-1) === first) {
    return `${first}${REDACTED_SECRET}${first}`;
  }
  return REDACTED_SECRET;
}

function isClearlyCodeReference(value: string): boolean {
  const unquoted = value.replace(/^['"]|['"]$/g, '').trim();
  return /^(?:process\.env\b|env\b|config(?:\.|\[)|(?:get|load|read)[A-Z][A-Za-z0-9_]*\()/i.test(unquoted);
}

function findTrailingSensitiveStart(text: string): number {
  let start = -1;
  for (const pattern of [TRAILING_BEARER_RE, TRAILING_SK_RE, TRAILING_AWS_RE, TRAILING_ASSIGNMENT_RE]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const boundary = match[1] ?? '';
    const candidateStart = (match.index ?? 0) + boundary.length;
    start = start === -1 ? candidateStart : Math.min(start, candidateStart);
  }

  const partialStart = findPartialPrefixStart(text);
  if (partialStart !== -1) start = start === -1 ? partialStart : Math.min(start, partialStart);
  return start;
}

function findPartialPrefixStart(text: string): number {
  const lower = text.toLowerCase();
  const first = Math.max(0, lower.length - MAX_PARTIAL_PREFIX_LENGTH + 1);
  for (let index = first; index < lower.length; index += 1) {
    if (!hasTokenStartBoundary(text, index)) continue;
    const suffix = lower.slice(index);
    if (PARTIAL_PREFIXES.some((prefix) => prefix.startsWith(suffix))) return index;
  }
  return -1;
}

function hasTokenStartBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  return !/[A-Za-z0-9_./]/.test(text[index - 1]);
}

function isSensitiveObjectKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, '').toLowerCase();
  return [
    'apikey',
    'token',
    'accesstoken',
    'secret',
    'password',
    'authorization',
    'xapikey',
    'xapitoken',
  ].includes(normalized);
}

function findSafeDelimiter(text: string): number {
  return text.search(/[\s,;}\]'\"]/);
}
