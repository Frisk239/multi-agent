import { afterEach, describe, expect, it } from 'vitest';
import {
  estimateCost,
  hasAnyRates,
  loadModelRates,
  parseModelRatesConfig,
  resetModelRatesCache,
  resolveModelRate,
  setModelRatesForTest,
  sumCostEstimates,
} from './model-rates';

afterEach(() => {
  resetModelRatesCache();
  delete process.env.MA_MODEL_RATES_JSON;
  delete process.env.MA_MODEL_RATES_PATH;
});

describe('parseModelRatesConfig', () => {
  it('parses nested models + aliases', () => {
    const c = parseModelRatesConfig({
      models: {
        'claude-sonnet-4': { promptUsdPer1M: 3, completionUsdPer1M: 15 },
      },
      aliases: { sonnet: 'claude-sonnet-4' },
    });
    expect(c.models['claude-sonnet-4'].promptUsdPer1M).toBe(3);
    expect(c.aliases?.sonnet).toBe('claude-sonnet-4');
  });

  it('ignores invalid rate entries', () => {
    const c = parseModelRatesConfig({
      models: {
        good: { promptUsdPer1M: 1, completionUsdPer1M: 2 },
        bad: { promptUsdPer1M: -1, completionUsdPer1M: 2 },
        worse: 'nope',
      },
    });
    expect(Object.keys(c.models)).toEqual(['good']);
  });
});

describe('estimateCost — honesty', () => {
  it('returns uncosted null when no rates configured (no fake $0)', () => {
    setModelRatesForTest({ models: {}, default: null });
    const est = estimateCost({
      model: 'claude-sonnet-4',
      tokensInput: 1_000_000,
      tokensOutput: 1_000_000,
    });
    expect(est.costUsd).toBeNull();
    expect(est.uncosted).toBe(true);
    expect(est.uncostedReason).toBe('no_rates');
  });

  it('returns uncosted for unknown model even with other rates', () => {
    setModelRatesForTest({
      models: {
        'claude-sonnet-4': { promptUsdPer1M: 3, completionUsdPer1M: 15 },
      },
      default: null,
    });
    const est = estimateCost({
      model: 'mystery-model-xyz',
      tokensInput: 1000,
      tokensOutput: 1000,
    });
    expect(est.costUsd).toBeNull();
    expect(est.uncosted).toBe(true);
    expect(est.uncostedReason).toBe('unknown_model');
  });

  it('computes cost with configured model rates', () => {
    setModelRatesForTest({
      models: {
        'claude-sonnet-4': { promptUsdPer1M: 3, completionUsdPer1M: 15 },
      },
    });
    // 2M prompt → $6; 1M completion → $15; total $21
    const est = estimateCost({
      model: 'claude-sonnet-4',
      tokensInput: 2_000_000,
      tokensOutput: 1_000_000,
    });
    expect(est.uncosted).toBe(false);
    expect(est.promptCostUsd).toBe(6);
    expect(est.completionCostUsd).toBe(15);
    expect(est.costUsd).toBe(21);
  });

  it('resolves aliases', () => {
    setModelRatesForTest({
      models: {
        'claude-sonnet-4': { promptUsdPer1M: 3, completionUsdPer1M: 15 },
      },
      aliases: { sonnet: 'claude-sonnet-4' },
    });
    const r = resolveModelRate('sonnet');
    expect(r.modelKey).toBe('claude-sonnet-4');
    expect(r.rate?.promptUsdPer1M).toBe(3);
  });

  it('different models yield different costs', () => {
    setModelRatesForTest({
      models: {
        cheap: { promptUsdPer1M: 1, completionUsdPer1M: 1 },
        pricey: { promptUsdPer1M: 10, completionUsdPer1M: 10 },
      },
    });
    const a = estimateCost({ model: 'cheap', tokensInput: 1_000_000, tokensOutput: 0 });
    const b = estimateCost({ model: 'pricey', tokensInput: 1_000_000, tokensOutput: 0 });
    expect(a.costUsd).toBe(1);
    expect(b.costUsd).toBe(10);
  });

  it('no_tokens → uncosted without counting as unknown_model', () => {
    setModelRatesForTest({
      models: { m: { promptUsdPer1M: 1, completionUsdPer1M: 1 } },
    });
    const est = estimateCost({ model: 'm', tokensInput: 0, tokensOutput: 0 });
    expect(est.costUsd).toBeNull();
    expect(est.uncostedReason).toBe('no_tokens');
  });
});

describe('loadModelRates from env JSON', () => {
  it('loads MA_MODEL_RATES_JSON', () => {
    process.env.MA_MODEL_RATES_JSON = JSON.stringify({
      models: { 'gpt-4o': { promptUsdPer1M: 2.5, completionUsdPer1M: 10 } },
    });
    resetModelRatesCache();
    const c = loadModelRates(true);
    expect(hasAnyRates(c)).toBe(true);
    expect(c.models['gpt-4o'].promptUsdPer1M).toBe(2.5);
  });
});

describe('sumCostEstimates', () => {
  it('sums only costed and counts uncosted', () => {
    setModelRatesForTest({
      models: { m: { promptUsdPer1M: 3, completionUsdPer1M: 15 } },
      default: null,
    });
    const a = estimateCost({ model: 'm', tokensInput: 1_000_000, tokensOutput: 0 });
    const b = estimateCost({ model: 'unknown', tokensInput: 100, tokensOutput: 0 });
    const sum = sumCostEstimates([a, b]);
    expect(sum.totalCostUsd).toBe(3);
    expect(sum.costedCount).toBe(1);
    expect(sum.uncostedCount).toBe(1);
  });
});
