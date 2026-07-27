import type { TokenUsage } from './types.js';

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

function pickUsageBlob(src: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!src || typeof src !== 'object') return null;
  const u = (src.usage ?? src.token_usage ?? src.tokenUsage) as unknown;
  if (u && typeof u === 'object') return u as Record<string, unknown>;
  return null;
}

/**
 * OpenCode step_finish 的 tokens 形状：
 * `{ input, output, reasoning?, cache?: { read, write } }`
 * （见 Multica opencode.go / opencode_test step_finish fixture）
 */
export function extractOpencodeStepTokens(blob: unknown): TokenUsage | null {
  if (!blob || typeof blob !== 'object') return null;
  const t = blob as Record<string, unknown>;
  const input = num(t.input ?? t.input_tokens ?? t.inputTokens);
  const output = num(t.output ?? t.output_tokens ?? t.outputTokens);
  let cacheRead: number | null = null;
  let cacheWrite: number | null = null;
  const cache = t.cache;
  if (cache && typeof cache === 'object') {
    const c = cache as Record<string, unknown>;
    cacheRead = num(c.read ?? c.cache_read ?? c.cacheRead);
    cacheWrite = num(c.write ?? c.cache_write ?? c.cacheWrite);
  } else {
    cacheRead = num(
      t.cache_read_input_tokens ?? t.cacheReadInputTokens ?? t.cache_read ?? t.cacheRead,
    );
    cacheWrite = num(
      t.cache_creation_input_tokens ??
        t.cacheCreationInputTokens ??
        t.cache_write ??
        t.cacheWrite,
    );
  }
  if (input == null && output == null && cacheRead == null && cacheWrite == null) {
    return null;
  }
  return { input, output, cacheRead, cacheWrite };
}

/** 从单段 usage 对象抽字段（兼容 snake/camel + Multica 常见别名 + OpenCode flat） */
export function extractTokenUsage(blob: unknown): TokenUsage | null {
  if (!blob || typeof blob !== 'object') return null;
  const u = blob as Record<string, unknown>;

  // OpenCode nested cache 优先走专用路径（避免 cache 对象被 num 忽略）
  if (u.cache && typeof u.cache === 'object' && (u.input != null || u.output != null)) {
    const step = extractOpencodeStepTokens(u);
    if (step) return step;
  }

  const input = num(
    u.input_tokens ?? u.inputTokens ?? u.prompt_tokens ?? u.promptTokens ?? u.input,
  );
  const output = num(
    u.output_tokens ?? u.outputTokens ?? u.completion_tokens ?? u.completionTokens ?? u.output,
  );
  const cacheRead = num(
    u.cache_read_input_tokens ??
      u.cacheReadInputTokens ??
      u.cache_read_tokens ??
      u.cacheReadTokens ??
      u.cache_read ??
      u.cacheRead,
  );
  const cacheWrite = num(
    u.cache_creation_input_tokens ??
      u.cacheCreationInputTokens ??
      u.cache_write_tokens ??
      u.cacheWriteTokens ??
      u.cache_write ??
      u.cacheWrite,
  );
  if (input == null && output == null && cacheRead == null && cacheWrite == null) {
    return null;
  }
  return { input, output, cacheRead, cacheWrite };
}

export function mergeUsage(a: TokenUsage | null, b: TokenUsage | null): TokenUsage | null {
  if (!a) return b;
  if (!b) return a;
  const add = (x: number | null | undefined, y: number | null | undefined) => {
    if (x == null && y == null) return null;
    return (x ?? 0) + (y ?? 0);
  };
  return {
    input: add(a.input, b.input),
    output: add(a.output, b.output),
    cacheRead: add(a.cacheRead, b.cacheRead),
    cacheWrite: add(a.cacheWrite, b.cacheWrite),
  };
}

/**
 * 从 stream-json 终态 result 行解析 usage（claude / cursor 等）。
 * 支持：
 * - 嵌套 usage / token_usage / tokenUsage
 * - 顶层 camel/snake token 字段（Cursor 偶发）
 * - modelUsage map 求和
 */
export function parseUsageFromResultLine(j: Record<string, unknown>): TokenUsage | null {
  let acc =
    extractTokenUsage(pickUsageBlob(j)) ??
    extractTokenUsage(j.usage) ??
    extractTokenUsage(j);

  const modelUsage = j.modelUsage ?? j.model_usage;
  if (modelUsage && typeof modelUsage === 'object') {
    for (const v of Object.values(modelUsage as Record<string, unknown>)) {
      acc = mergeUsage(acc, extractTokenUsage(v));
    }
  }
  return acc;
}

/** 行上是否具备可成本化的 token 信号（analytics no_tokens 对照） */
export function hasTokenSignal(usage: TokenUsage | null | undefined): boolean {
  if (!usage) return false;
  return (
    (usage.input != null && usage.input > 0) ||
    (usage.output != null && usage.output > 0) ||
    (usage.cacheRead != null && usage.cacheRead > 0) ||
    (usage.cacheWrite != null && usage.cacheWrite > 0)
  );
}
