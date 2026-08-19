import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqlite } from '../db/client.js';
import { memoryItems } from '../db/schema.js';
import { SqliteTextProvider, tokenize, FTS_TABLE } from './sqlite-text-provider.js';
import { eq } from 'drizzle-orm';

describe('SqliteTextProvider - Temporal Validity', () => {
  let provider: SqliteTextProvider;

  beforeEach(() => {
    provider = new SqliteTextProvider();
    sqlite.exec('DROP TABLE IF EXISTS memory_item;');
    sqlite.exec(`CREATE TABLE memory_item (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'workspace',
      project_id TEXT,
      issue_id TEXT,
      agent_id TEXT,
      run_id TEXT,
      text TEXT NOT NULL,
      valid_at INTEGER,
      invalid_at INTEGER,
      created_at INTEGER NOT NULL
    );`);
    // G4-1：重建基表后重调 initialize（幂等重建 FTS5 索引 + 回填）
    provider.initialize();
    // Clean up memory items table
    db.delete(memoryItems).run();
  });

  it('should add memory and invalidate it', async () => {
    const memory = provider.addRaw('Test memory content');
    expect(memory.id).toBeDefined();

    // Memory should be fetchable normally
    const resultBefore = await provider.prefetch('Test');
    expect(resultBefore.items).toHaveLength(1);
    expect(resultBefore.items[0].id).toBe(memory.id);

    // Invalidate the memory
    const invalidated = provider.invalidateMemory(memory.id);
    expect(invalidated).toBe(true);

    // After invalidation, default prefetch should not return it
    const resultAfter = await provider.prefetch('Test');
    expect(resultAfter.items).toHaveLength(0);

    // prefetch with includeInvalid should return it
    const resultWithInvalid = await provider.prefetch('Test', { includeInvalid: true });
    expect(resultWithInvalid.items).toHaveLength(1);
    expect(resultWithInvalid.items[0].id).toBe(memory.id);
  });

  it('getById should return invalidAt', async () => {
    const memory = provider.addRaw('Another memory');
    provider.invalidateMemory(memory.id);

    const fetched = provider.getById(memory.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.invalidAt).toBeDefined();
    
    if (fetched?.invalidAt) {
      const invalidTime = new Date(fetched.invalidAt).getTime();
      expect(invalidTime).toBeLessThanOrEqual(Date.now());
    }
  });
});

describe('G4-1 FTS5 retrieval (SqliteTextProvider)', () => {
  let provider: SqliteTextProvider;

  beforeEach(() => {
    provider = new SqliteTextProvider();
    sqlite.exec('DROP TABLE IF EXISTS memory_item;');
    sqlite.exec(`CREATE TABLE memory_item (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'workspace',
      project_id TEXT,
      issue_id TEXT,
      agent_id TEXT,
      run_id TEXT,
      text TEXT NOT NULL,
      valid_at INTEGER,
      invalid_at INTEGER,
      created_at INTEGER NOT NULL
    );`);
    provider.initialize();
    db.delete(memoryItems).run();
  });

  it('FTS5 可用且 initialize 建表（编译选项 ENABLE_FTS5）', () => {
    const row = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(FTS_TABLE);
    expect(row).toBeTruthy();
  });

  it('tokenize/gram 化：ASCII 词 + CJK 双字 gram', () => {
    expect(tokenize('TypeScript 测试覆盖')).toEqual(
      expect.arrayContaining(['typescript', '测试', '试覆', '覆盖']),
    );
  });

  it('>200 行硬上限回归：老但强相关的记忆仍被召回（G4-1 核心）', async () => {
    for (let i = 0; i < 210; i++) {
      provider.addRaw(`噪声记忆条目编号 ${i} 与检索词完全无关的内容`);
    }
    const old = provider.addRaw('unique-token-xyz 唯一标记：记忆检索不再受 200 行限制');
    // 200 行上限下：老记忆被挤出 → 查不到；FTS 全量召回 → 能查到
    const res = await provider.prefetch('unique-token-xyz');
    expect(res.items.some((m) => m.id === old.id)).toBe(true);
  });

  it('CJK 2 字 gram 查询命中（裸 unicode61 会失配）', async () => {
    provider.addRaw('用户说问题已解决');
    const res = await provider.prefetch('问题');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].text).toContain('问题已解决');
  });

  it('project-scoped recall includes same-project + global, never another project', async () => {
    const global = provider.addRaw('共享边界 token-global');
    const projectA = provider.addRaw('项目 A token-project', { projectId: 'project-a' });
    provider.addRaw('项目 B token-project', { projectId: 'project-b' });

    const result = await provider.prefetch('token-project', { projectId: 'project-a' });
    expect(result.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([projectA.id]),
    );
    expect(result.items.some((item) => item.text.includes('项目 B'))).toBe(false);

    const globalResult = await provider.prefetch('token-global', { projectId: 'project-a' });
    expect(globalResult.items.some((item) => item.id === global.id)).toBe(true);
  });

  it('多 token 全 AND：缺任一词不命中', async () => {
    provider.addRaw('TypeScript 测试覆盖');
    const miss = await provider.prefetch('TypeScript 不存在的词');
    expect(miss.items).toHaveLength(0);
    const hit = await provider.prefetch('TypeScript 测试');
    expect(hit.items).toHaveLength(1);
  });

  it('invalid 默认排除 / includeInvalid 包含（FTS 侧沿用）', async () => {
    const m = provider.addRaw('invalid 过滤测试记忆');
    provider.invalidateMemory(m.id);
    const def = await provider.prefetch('过滤测试');
    expect(def.items).toHaveLength(0);
    const inc = await provider.prefetch('过滤测试', { includeInvalid: true });
    expect(inc.items).toHaveLength(1);
  });

  it('deleteById 后 FTS 同步删除，不再命中', async () => {
    const m = provider.addRaw('删除同步测试关键词 alpha');
    expect((await provider.prefetch('alpha')).items).toHaveLength(1);
    provider.deleteById(m.id);
    expect((await provider.prefetch('alpha')).items).toHaveLength(0);
  });

  it('返回带 score 且按相关度排序（BM25 + scope 加权 + 时间衰减）', async () => {
    const now = Date.now();
    const hit = provider.addRaw('精确命中检索词 benchmark-score');
    provider.addRaw('部分相关 benchmark 但缺少关键词');
    const res = await provider.prefetch('benchmark-score');
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0].id).toBe(hit.id);
    expect(typeof res.items[0].score).toBe('number');
    // createdAt 被 addRaw 以真实时间写；score 排序稳定性不依赖绝对时间
    expect(res.items[0].score! >= (res.items[1]?.score ?? -Infinity)).toBe(true);
    void now;
  });

  it('G4-4 addRaw 带 scope 写入并回读标签', () => {
    const workspace = provider.addRaw('scope 标签写入测试 workspace-hit');
    const issue = provider.addRaw('scope 标签写入测试 issue-hit', { scope: 'issue' });
    const run = provider.addRaw('scope 标签写入测试 run-hit', { scope: 'run' });
    expect(workspace.scope).toBe('workspace');
    expect(issue.scope).toBe('issue');
    expect(run.scope).toBe('run');
    // 缺省 = workspace
    expect(provider.addRaw('scope 默认').scope).toBe('workspace');
  });

  it('G4-4 prefetch 空查询按 scope 过滤（最近 N 条）', async () => {
    provider.addRaw('scope-a-1', { scope: 'workspace' });
    provider.addRaw('scope-b-1', { scope: 'issue' });
    provider.addRaw('scope-b-2', { scope: 'issue' });

    const ws = await provider.prefetch('', { limit: 10, scope: 'workspace' });
    expect(ws.items.map((i) => i.scope)).toEqual(['workspace']);
    expect(ws.items).toHaveLength(1);

    const issue = await provider.prefetch('', { limit: 10, scope: 'issue' });
    expect(issue.items).toHaveLength(2);
    expect(issue.items.every((i) => i.scope === 'issue')).toBe(true);
  });

  it('G4-4 prefetch 关键词查询按 scope 过滤（FTS 路径）', async () => {
    provider.addRaw('统一投影关键字 alpha', { scope: 'workspace' });
    provider.addRaw('统一投影关键字 beta', { scope: 'run' });
    provider.addRaw('统一投影关键字 gamma', { scope: 'issue' });

    const run = await provider.prefetch('统一投影关键字', { limit: 10, scope: 'run' });
    expect(run.items).toHaveLength(1);
    expect(run.items[0].text).toContain('beta');
    expect(run.items[0].scope).toBe('run');

    const all = await provider.prefetch('统一投影关键字', { limit: 10 });
    expect(all.items).toHaveLength(3);
  });
});
