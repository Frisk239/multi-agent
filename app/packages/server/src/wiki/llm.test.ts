/**
 * G6-3：wiki-llm 模块直测（原零测试）。
 * 覆盖：createLlm 双 provider / 无 key 诚实 throw / baseURL 传递；
 * buildIngestPrompt 增量/非增量模板；generateWikiPage content 归一化。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createLlm, buildIngestPrompt, generateWikiPage } from './llm.js';
import type { Issue } from '@ma/shared';

const ENV_KEYS = [
  'WIKI_LLM_PROVIDER',
  'WIKI_LLM_API_KEY',
  'WIKI_LLM_MODEL',
  'WIKI_LLM_BASE_URL',
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

function fakeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'iss-1',
    workspaceId: 'ws-1',
    identifier: 'FRI-1',
    title: 'Test',
    description: null,
    status: 'done',
    priority: 'none',
    assignee: null,
    creatorType: 'member',
    creatorId: 'm1',
    position: 0,
    labels: [],
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('createLlm (G6-3)', () => {
  it('无 WIKI_LLM_API_KEY → 诚实 throw（不静默降级成空模型）', () => {
    delete process.env.WIKI_LLM_API_KEY;
    expect(() => createLlm()).toThrow(/WIKI_LLM_API_KEY 未配置/);
  });

  it('默认 provider=openai，model 缺省 gpt-4o', () => {
    process.env.WIKI_LLM_API_KEY = 'k1';
    const llm = createLlm() as { model?: string };
    expect((llm as unknown as { _model?: string })._model ?? llm.model).toBe('gpt-4o');
  });

  it('WIKI_LLM_MODEL 覆盖 model', () => {
    process.env.WIKI_LLM_API_KEY = 'k1';
    process.env.WIKI_LLM_MODEL = 'qwen-max';
    const llm = createLlm() as { model?: string };
    expect((llm as unknown as { _model?: string })._model ?? llm.model).toBe('qwen-max');
  });

  it('provider=anthropic → ChatAnthropic 实例', () => {
    process.env.WIKI_LLM_API_KEY = 'k1';
    process.env.WIKI_LLM_PROVIDER = 'anthropic';
    const llm = createLlm();
    // ChatAnthropic 与 ChatOpenAI 是不同类（provider 工厂分支生效）
    expect(llm.constructor.name).toContain('Anthropic');
  });

  it('openai + WIKI_LLM_BASE_URL → configuration.baseURL 传递（智谱/通义/Ollama 端点）', () => {
    process.env.WIKI_LLM_API_KEY = 'k1';
    process.env.WIKI_LLM_BASE_URL = 'http://localhost:11434/v1';
    const llm = createLlm() as unknown as {
      clientConfig?: { baseURL?: string };
      configuration?: { baseURL?: string };
    };
    const baseURL = llm.configuration?.baseURL ?? llm.clientConfig?.baseURL;
    expect(baseURL).toBe('http://localhost:11434/v1');
  });

  it('未知 provider 回退 openai（不 throw）', () => {
    process.env.WIKI_LLM_API_KEY = 'k1';
    process.env.WIKI_LLM_PROVIDER = 'ollama';
    expect(() => createLlm()).not.toThrow();
  });
});

describe('buildIngestPrompt (G6-3)', () => {
  it('无 existingContext → 基础模板（首行 # 标题要求 + Issue 标识）', () => {
    const p = buildIngestPrompt(fakeIssue({ identifier: 'FRI-42', title: 'T' }), 'source-text');
    expect(p).toContain('Issue FRI-42: T');
    expect(p).toContain('source-text');
    expect(p).toContain('# 标题开头');
    expect(p).not.toContain('知识冲突警告');
  });

  it('有 existingContext → 增量模板含知识冲突 Warning 段落', () => {
    const p = buildIngestPrompt(fakeIssue(), 'src', 'existing-wiki-content');
    expect(p).toContain('existing-wiki-content');
    expect(p).toContain('知识冲突警告');
    expect(p).toContain('> [!WARNING]');
  });
});

describe('generateWikiPage (G6-3)', () => {
  it('content 为 string → 原样返回', async () => {
    const llm = { invoke: async () => ({ content: '# Page' }) } as never;
    await expect(generateWikiPage(llm, 'p')).resolves.toBe('# Page');
  });

  it('content 为复杂块数组 → JSON.stringify（不崩、可回放）', async () => {
    const llm = {
      invoke: async () => ({ content: [{ type: 'text', text: 'block' }] }),
    } as never;
    await expect(generateWikiPage(llm, 'p')).resolves.toBe(
      JSON.stringify([{ type: 'text', text: 'block' }]),
    );
  });

  it('invoke 抛错（网络/上游）→ 原样上抛（由 ingest 调用方处理降级）', async () => {
    const llm = {
      invoke: async () => {
        throw new Error('upstream 500');
      },
    } as never;
    await expect(generateWikiPage(llm, 'p')).rejects.toThrow('upstream 500');
  });
});
