/**
 * Slice 28：本地模型价表 + 诚实成本估算。
 *
 * 配置来源（优先序）：
 * 1. MA_MODEL_RATES_JSON — 内联 JSON 字符串
 * 2. MA_MODEL_RATES_PATH — 价表文件路径
 * 3. （可选）process.cwd()/model-rates.json 若存在
 *
 * 无配置 / 未知 model → uncosted（costUsd=null），禁止假 $0。
 * 不落密钥；价表仅含公开费率。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ModelRate = {
  /** USD per 1M prompt/input tokens */
  promptUsdPer1M: number;
  /** USD per 1M completion/output tokens */
  completionUsdPer1M: number;
};

export type ModelRatesConfig = {
  models: Record<string, ModelRate>;
  /** model id / 简称 → models 键 */
  aliases?: Record<string, string>;
  /**
   * 未知 model 时的兜底费率。
   * 默认 null：未知即 uncosted（不兜底 $3/$15）。
   */
  default?: ModelRate | null;
};

export type CostEstimate = {
  costUsd: number | null;
  promptCostUsd: number | null;
  completionCostUsd: number | null;
  rate: ModelRate | null;
  /** 解析后的价表键（alias 展开后） */
  modelKey: string | null;
  uncosted: boolean;
  uncostedReason?: 'no_rates' | 'unknown_model' | 'no_tokens';
};

const EMPTY_CONFIG: ModelRatesConfig = { models: {}, default: null };

let cached: { signature: string; config: ModelRatesConfig } | null = null;

function isRate(v: unknown): v is ModelRate {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.promptUsdPer1M === 'number' &&
    Number.isFinite(r.promptUsdPer1M) &&
    r.promptUsdPer1M >= 0 &&
    typeof r.completionUsdPer1M === 'number' &&
    Number.isFinite(r.completionUsdPer1M) &&
    r.completionUsdPer1M >= 0
  );
}

/** 解析价表 JSON（宽松：忽略非法条目） */
export function parseModelRatesConfig(raw: unknown): ModelRatesConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CONFIG, models: {} };
  const obj = raw as Record<string, unknown>;
  const models: Record<string, ModelRate> = {};
  const src = obj.models;
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const key = k.trim();
      if (!key || !isRate(v)) continue;
      models[key] = {
        promptUsdPer1M: v.promptUsdPer1M,
        completionUsdPer1M: v.completionUsdPer1M,
      };
    }
  }
  // 也允许顶层直接 { "claude-sonnet-4": { ... } }（无 models 包一层）
  if (Object.keys(models).length === 0) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'aliases' || k === 'default' || k.startsWith('$')) continue;
      const key = k.trim();
      if (!key || !isRate(v)) continue;
      models[key] = {
        promptUsdPer1M: v.promptUsdPer1M,
        completionUsdPer1M: v.completionUsdPer1M,
      };
    }
  }

  let aliases: Record<string, string> | undefined;
  if (obj.aliases && typeof obj.aliases === 'object') {
    aliases = {};
    for (const [k, v] of Object.entries(obj.aliases as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) aliases[k.trim()] = v.trim();
    }
  }

  let def: ModelRate | null | undefined;
  if (obj.default === null) def = null;
  else if (isRate(obj.default)) def = { ...obj.default };
  else def = null;

  return { models, aliases, default: def };
}

function tryReadJsonFile(path: string): unknown | null {
  try {
    if (!existsSync(path)) return null;
    const text = readFileSync(path, 'utf-8');
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function envSignature(): string {
  return [
    process.env.MA_MODEL_RATES_JSON ?? '',
    process.env.MA_MODEL_RATES_PATH ?? '',
    process.cwd(),
  ].join('\0');
}

/**
 * 加载当前进程价表（带简单缓存；env/cwd 变化时重载）。
 * 无配置 → 空 models，全部 uncosted。
 */
export function loadModelRates(forceReload = false): ModelRatesConfig {
  const sig = envSignature();
  if (!forceReload && cached && cached.signature === sig) return cached.config;

  let config: ModelRatesConfig = { models: {}, default: null };

  const jsonEnv = process.env.MA_MODEL_RATES_JSON?.trim();
  if (jsonEnv) {
    try {
      config = parseModelRatesConfig(JSON.parse(jsonEnv));
      cached = { signature: sig, config };
      return config;
    } catch {
      // fall through to path
    }
  }

  const pathEnv = process.env.MA_MODEL_RATES_PATH?.trim();
  if (pathEnv) {
    const abs = resolve(pathEnv);
    const raw = tryReadJsonFile(abs);
    if (raw != null) {
      config = parseModelRatesConfig(raw);
      cached = { signature: sig, config };
      return config;
    }
  }

  // 可选：cwd 下 model-rates.json（不自动读 example，避免误用样例费率）
  const cwdFile = resolve(process.cwd(), 'model-rates.json');
  const rawCwd = tryReadJsonFile(cwdFile);
  if (rawCwd != null) {
    config = parseModelRatesConfig(rawCwd);
    cached = { signature: sig, config };
    return config;
  }

  cached = { signature: sig, config };
  return config;
}

/** 测试/注入用：重置缓存 */
export function resetModelRatesCache(): void {
  cached = null;
}

/** 测试/注入用：直接塞配置（signature 对齐 envSignature，避免 loadModelRates 立刻丢弃） */
export function setModelRatesForTest(config: ModelRatesConfig | null): void {
  if (config == null) {
    cached = null;
    return;
  }
  cached = { signature: envSignature(), config };
}

export function hasAnyRates(config?: ModelRatesConfig): boolean {
  const c = config ?? loadModelRates();
  return Object.keys(c.models).length > 0 || isRate(c.default);
}

export function resolveModelRate(
  model: string | null | undefined,
  config?: ModelRatesConfig,
): { rate: ModelRate | null; modelKey: string | null; uncostedReason?: CostEstimate['uncostedReason'] } {
  const c = config ?? loadModelRates();
  const hasModels = Object.keys(c.models).length > 0 || isRate(c.default);
  if (!hasModels) {
    return { rate: null, modelKey: null, uncostedReason: 'no_rates' };
  }

  const raw = (model ?? '').trim();
  if (!raw) {
    if (isRate(c.default)) return { rate: c.default, modelKey: 'default' };
    return { rate: null, modelKey: null, uncostedReason: 'unknown_model' };
  }

  // exact → alias → case-insensitive exact → prefix match on models keys
  const tryKeys = [raw];
  const alias = c.aliases?.[raw] ?? c.aliases?.[raw.toLowerCase()];
  if (alias) tryKeys.push(alias);

  for (const k of tryKeys) {
    if (c.models[k]) return { rate: c.models[k], modelKey: k };
  }
  const lower = raw.toLowerCase();
  for (const [k, rate] of Object.entries(c.models)) {
    if (k.toLowerCase() === lower) return { rate, modelKey: k };
  }
  // 宽松：model 含 key 或 key 含 model（如 provider/model）
  for (const [k, rate] of Object.entries(c.models)) {
    const kl = k.toLowerCase();
    if (lower.includes(kl) || kl.includes(lower)) return { rate, modelKey: k };
  }

  if (isRate(c.default)) return { rate: c.default, modelKey: 'default' };
  return { rate: null, modelKey: null, uncostedReason: 'unknown_model' };
}

function money(n: number): number {
  return Number(n.toFixed(6));
}

/**
 * 统一成本估算。
 * - 有价表且有 token → costUsd 数字
 * - 无价表 / 未知 model / 无任何 token → costUsd=null + uncosted
 * - **禁止**把「无价表」写成 $0
 */
export function estimateCost(input: {
  model?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  config?: ModelRatesConfig;
}): CostEstimate {
  const promptTokens =
    typeof input.tokensInput === 'number' && Number.isFinite(input.tokensInput) && input.tokensInput > 0
      ? input.tokensInput
      : 0;
  const completionTokens =
    typeof input.tokensOutput === 'number' &&
    Number.isFinite(input.tokensOutput) &&
    input.tokensOutput > 0
      ? input.tokensOutput
      : 0;

  if (promptTokens === 0 && completionTokens === 0) {
    return {
      costUsd: null,
      promptCostUsd: null,
      completionCostUsd: null,
      rate: null,
      modelKey: null,
      uncosted: true,
      uncostedReason: 'no_tokens',
    };
  }

  const { rate, modelKey, uncostedReason } = resolveModelRate(input.model, input.config);
  if (!rate) {
    return {
      costUsd: null,
      promptCostUsd: null,
      completionCostUsd: null,
      rate: null,
      modelKey,
      uncosted: true,
      uncostedReason: uncostedReason ?? 'unknown_model',
    };
  }

  const promptCostUsd = money((promptTokens / 1_000_000) * rate.promptUsdPer1M);
  const completionCostUsd = money((completionTokens / 1_000_000) * rate.completionUsdPer1M);
  const costUsd = money(promptCostUsd + completionCostUsd);

  return {
    costUsd,
    promptCostUsd,
    completionCostUsd,
    rate,
    modelKey,
    uncosted: false,
  };
}

/** 汇总多条 estimate：部分 uncosted 时 cost 为 costed 之和，并标 uncosted 计数 */
export function sumCostEstimates(
  items: CostEstimate[],
): {
  promptCostUsd: number | null;
  completionCostUsd: number | null;
  totalCostUsd: number | null;
  costedCount: number;
  uncostedCount: number;
} {
  let p = 0;
  let c = 0;
  let costed = 0;
  let uncosted = 0;
  for (const it of items) {
    if (it.uncosted || it.costUsd == null) {
      // no_tokens 不计入 uncosted 跑次（无用量）
      if (it.uncostedReason !== 'no_tokens') uncosted += 1;
      continue;
    }
    p += it.promptCostUsd ?? 0;
    c += it.completionCostUsd ?? 0;
    costed += 1;
  }
  if (costed === 0) {
    return {
      promptCostUsd: null,
      completionCostUsd: null,
      totalCostUsd: null,
      costedCount: 0,
      uncostedCount: uncosted,
    };
  }
  return {
    promptCostUsd: money(p),
    completionCostUsd: money(c),
    totalCostUsd: money(p + c),
    costedCount: costed,
    uncostedCount: uncosted,
  };
}
