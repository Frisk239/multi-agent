import { describe, it, expect } from 'vitest';
import { parseAgentEnvVars, parseAgentCustomArgs } from './agent-inject.js';
import { spawnLineProcess } from './spawn-line.js';

// G3-4b：agent.env_vars / custom_args（DB JSON）→ 注入对象解析 + spawn env 真实覆盖实证。
// spawn 实证用真子进程（node -e），证明「显式覆盖 process.env」语义，
// 与 printenv 工具任务实证（API 层）互为补充。

describe('G3-4b agent-inject: parseAgentEnvVars', () => {
  it('解析 [{key,value}] JSON → 对象', () => {
    expect(
      parseAgentEnvVars(JSON.stringify([{ key: 'MA_TOKEN', value: 'abc' }, { key: 'EMPTY', value: '' }])),
    ).toEqual({ MA_TOKEN: 'abc', EMPTY: '' });
  });

  it('坏 JSON / 非数组 / 空数组 → null（不砸 run）', () => {
    expect(parseAgentEnvVars('{bad')).toBeNull();
    expect(parseAgentEnvVars('"str"')).toBeNull();
    expect(parseAgentEnvVars('[]')).toBeNull();
    expect(parseAgentEnvVars(null)).toBeNull();
  });

  it('缺 value / 空 key 条目容错跳过', () => {
    expect(parseAgentEnvVars(JSON.stringify([{ key: 'A', value: '1' }, { value: 'x' }, {}]))).toEqual({ A: '1' });
  });
});

describe('G3-4b agent-inject: parseAgentCustomArgs', () => {
  it('解析 string[] JSON → 数组', () => {
    expect(parseAgentCustomArgs(JSON.stringify(['--verbose', '--models', 'gpt-5']))).toEqual([
      '--verbose',
      '--models',
      'gpt-5',
    ]);
  });

  it('坏 JSON / 非数组 / 空数组 → null', () => {
    expect(parseAgentCustomArgs('nope')).toBeNull();
    expect(parseAgentCustomArgs('{"a":1}')).toBeNull();
    expect(parseAgentCustomArgs('[]')).toBeNull();
    expect(parseAgentCustomArgs(null)).toBeNull();
  });
});

describe('G3-4b spawn env 合并（真子进程实证）', () => {
  it('opts.env 显式覆盖 process.env，未覆盖键继承', async () => {
    // 基座 env 里放一个会被覆盖的键 + 一个继承键
    (process.env as Record<string, string>).MA_INJ_BASE = 'base-value';
    (process.env as Record<string, string>).MA_INJ_KEEP = 'keep-me';
    const script =
      'console.log(JSON.stringify({overridden: process.env.MA_INJ_BASE, kept: process.env.MA_INJ_KEEP, added: process.env.MA_INJ_ADD}))';
    const result = await spawnLineProcess(
      process.execPath,
      ['-e', script],
      process.cwd(),
      new AbortController().signal,
      () => {},
      null,
      undefined,
      { env: { MA_INJ_BASE: 'injected-value', MA_INJ_ADD: 'extra' } },
    );
    expect(result.exitReason).toBe('completed');
    const printed = JSON.parse(result.finalText);
    expect(printed.overridden).toBe('injected-value');
    expect(printed.kept).toBe('keep-me');
    expect(printed.added).toBe('extra');
  });

  it('无 opts.env 时子进程继承 process.env 原样', async () => {
    (process.env as Record<string, string>).MA_INJ_KEEP2 = 'still-here';
    const result = await spawnLineProcess(
      process.execPath,
      ['-e', 'console.log(process.env.MA_INJ_KEEP2)'],
      process.cwd(),
      new AbortController().signal,
      () => {},
      null,
    );
    expect(result.exitReason).toBe('completed');
    expect(result.finalText.trim()).toBe('still-here');
  });
});
