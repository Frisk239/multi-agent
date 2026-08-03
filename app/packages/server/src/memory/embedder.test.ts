/**
 * G6-9：embedder 直测（原零测试）—— 钉死无 key / 网络失败 / dims 不匹配分支，
 * 防 G1-5 降级路径漂移（embedder 是 pgvector 上游，坏分支会让降级行为失真）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEmbeddingConfig,
  embedTexts,
  embedQuery,
  vectorLiteral,
} from './embedder.js';

const ENV_KEYS = [
  'EMBEDDING_API_KEY',
  'EMBEDDING_BASE_URL',
  'EMBEDDING_MODEL',
  'EMBEDDING_DIMS',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe('getEmbeddingConfig (G6-9)', () => {
  it('默认：key 空、openai 官方端点、text-embedding-3-small、1536 dims', () => {
    const cfg = getEmbeddingConfig();
    expect(cfg).toEqual({
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      dims: 1536,
    });
  });

  it('EMBEDDING_* 优先于 OPENAI_*；baseURL 尾斜杠剥除', () => {
    process.env.EMBEDDING_API_KEY = 'ek';
    process.env.EMBEDDING_BASE_URL = 'http://localhost:8000/v1/';
    process.env.EMBEDDING_MODEL = 'bge-m3';
    process.env.EMBEDDING_DIMS = '1024';
    process.env.OPENAI_API_KEY = 'ok';
    process.env.OPENAI_BASE_URL = 'http://ignored';
    const cfg = getEmbeddingConfig();
    expect(cfg).toEqual({
      apiKey: 'ek',
      baseURL: 'http://localhost:8000/v1',
      model: 'bge-m3',
      dims: 1024,
    });
  });

  it('无 EMBEDDING_* 时回退 OPENAI_*', () => {
    process.env.OPENAI_API_KEY = 'ok';
    process.env.OPENAI_BASE_URL = 'http://openai.local/v1/';
    const cfg = getEmbeddingConfig();
    expect(cfg.apiKey).toBe('ok');
    expect(cfg.baseURL).toBe('http://openai.local/v1');
  });
});

describe('embedTexts (G6-9)', () => {
  beforeEach(() => {
    process.env.EMBEDDING_API_KEY = 'ek';
  });

  it('无 key → 诚实 throw（不静默发空请求）', async () => {
    delete process.env.EMBEDDING_API_KEY;
    await expect(embedTexts(['x'])).rejects.toThrow(/未配置/);
  });

  it('空数组 → [] 且不 fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(embedTexts([])).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('HTTP 失败（401）→ throw 带状态码与响应体', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      }),
    );
    await expect(embedTexts(['x'])).rejects.toThrow(/embedding HTTP 401: unauthorized/);
  });

  it('dims 不匹配 → throw（防向量列写入错维度）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2], index: 0 }] }),
      }),
    );
    await expect(embedTexts(['x'])).rejects.toThrow(/dims 2 !== EMBEDDING_DIMS 1536/);
  });

  it('成功：按 index 排序返回 + Authorization 头正确', async () => {
    process.env.EMBEDDING_DIMS = '1';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [0.9], index: 1 },
          { embedding: [0.1], index: 0 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await embedTexts(['b', 'a']);
    expect(res).toEqual([[0.1], [0.9]]); // index 序
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ek');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'text-embedding-3-small',
      input: ['b', 'a'],
    });
  });
});

describe('embedQuery / vectorLiteral (G6-9)', () => {
  it('embedQuery 取单元素', async () => {
    process.env.EMBEDDING_API_KEY = 'ek';
    process.env.EMBEDDING_DIMS = '2';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.5, 0.6], index: 0 }] }),
      }),
    );
    await expect(embedQuery('q')).resolves.toEqual([0.5, 0.6]);
  });

  it('vectorLiteral 输出 pgvector 字面量格式', () => {
    expect(vectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
    expect(vectorLiteral([])).toBe('[]');
  });
});
