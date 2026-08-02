import { desc, eq, isNull, gt, or, sql } from 'drizzle-orm';
import { db, sqlite } from '../db/client.js';
import { memoryItems } from '../db/schema.js';
import type {
  MemoryItemView,
  MemoryPrefetchResult,
  MemoryProvider,
  MemorySyncInput,
} from './types.js';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

/** 简易分词：ASCII 词长≥2 + CJK 双字 gram */
export function tokenize(query: string): string[] {
  const tokens = new Set<string>();
  for (const m of query.match(/\w{2,}/g) ?? []) tokens.add(m.toLowerCase());
  const cjk = query.match(/[\u4e00-\u9fff]+/g)?.join('') ?? '';
  for (let i = 0; i < cjk.length - 1; i++) tokens.add(cjk.slice(i, i + 2));
  return [...tokens];
}

/**
 * G4-1：FTS5 虚拟表名。存 gram 化文本（tokenize 同规则：ASCII 词 + CJK 双字 gram），
 * rowid 关联 memory_item。裸 unicode61 会把连续 CJK 当单个 token（2 字查询失配），
 * 故索引与查询两侧统一 gram 化。
 */
export const FTS_TABLE = 'memory_item_fts';

/** scope 加权（G4-1 只加权重；多维 scope 体系留 G4-4） */
const SCOPE_WEIGHT: Record<string, number> = {
  workspace: 1.0,
  agent: 1.1,
  issue: 1.2,
  run: 1.3,
};

/** 重排候选窗口（原 200 行硬上限 → FTS 全量召回 + 二次重排） */
const FTS_CANDIDATE_K = 100;

export class SqliteTextProvider implements MemoryProvider {
  readonly name = 'sqlite-text';

  isAvailable(): boolean {
    return true;
  }

  /**
   * G4-1：幂等重建 FTS5 索引（独立虚拟表，非 external content——gram 化无法用
   * SQL 触发器表达，写路径同步 + 启动全量回填双保险防漂移；换库/测试重建表场景
   * 由调用方在重建后重调本方法）。
   */
  initialize(): void {
    sqlite.exec(`
      DROP TABLE IF EXISTS ${FTS_TABLE};
      CREATE VIRTUAL TABLE ${FTS_TABLE} USING fts5(text);
    `);
    const rows = db
      .select({ rowid: sql<number>`rowid`, text: memoryItems.text })
      .from(memoryItems)
      .all();
    const ins = sqlite.prepare(`INSERT INTO ${FTS_TABLE}(rowid, text) VALUES (?, ?)`);
    for (const r of rows) ins.run(r.rowid, tokenize(r.text).join(' '));
  }

  prefetchSync(query: string, opts?: { limit?: number; includeInvalid?: boolean }): MemoryPrefetchResult {
    const limit = opts?.limit ?? 5;
    const includeInvalid = opts?.includeInvalid ?? false;
    const tokens = tokenize(query);
    const now = Date.now();
    
    let baseQuery = db.select().from(memoryItems);
    if (!includeInvalid) {
      baseQuery = baseQuery.where(or(isNull(memoryItems.invalidAt), gt(memoryItems.invalidAt, now))) as any;
    }
    
    let rows: Array<{
      id: string; scope: string; issueId: string | null; agentId: string | null;
      runId: string | null; text: string; validAt: number | null; invalidAt: number | null;
      createdAt: number; score: number;
    }>;
    if (tokens.length === 0) {
      rows = (baseQuery
        .orderBy(desc(memoryItems.createdAt))
        .limit(limit)
        .all() as never as Array<{ id: string; scope: string; issueId: string | null; agentId: string | null; runId: string | null; text: string; validAt: number | null; invalidAt: number | null; createdAt: number }>)
        .map((r) => ({ ...r, score: 0 }));
    } else {
      // G4-1：FTS5 全量召回（BM25 排序，不再受 200 行上限约束）+ 二次重排：
      // scope 加权 + 30 天时间衰减（记忆越多检索越准，不再退化）
      const matchQ = tokens.join(' '); // FTS5 隐式 AND = 原「全 token AND」语义
      const raw = sqlite
        .prepare(
          `SELECT m.id AS id, m.scope AS scope, m.issue_id AS issueId, m.agent_id AS agentId,
                  m.run_id AS runId, m.text AS text, m.valid_at AS validAt, m.invalid_at AS invalidAt,
                  m.created_at AS createdAt, bm25(${FTS_TABLE}) AS bm25
           FROM ${FTS_TABLE} f
           JOIN memory_item m ON m.rowid = f.rowid
           WHERE ${FTS_TABLE} MATCH ?
           ORDER BY bm25(${FTS_TABLE})
           LIMIT ?`,
        )
        .all(matchQ, FTS_CANDIDATE_K) as Array<{
        id: string; scope: string; issueId: string | null; agentId: string | null;
        runId: string | null; text: string; validAt: number | null; invalidAt: number | null;
        createdAt: number; bm25: number;
      }>;
      rows = raw
        .filter((r) => includeInvalid || r.invalidAt == null || r.invalidAt > now)
        .map((r) => {
          const w = SCOPE_WEIGHT[r.scope] ?? 1.0;
          const ageDays = (now - r.createdAt) / 86_400_000;
          const recency = Math.max(0, 1 - ageDays / 30);
          const score = Number(r.bm25 ?? 0) + (w - 1) * 0.5 + recency * 0.3;
          return { ...r, score };
        })
        .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
        .slice(0, limit);
    }
    return {
      items: rows.map((r) => ({
        id: r.id,
        text: r.text,
        score: r.score,
        source: 'sqlite-text',
        issueId: r.issueId,
        runId: r.runId,
        createdAt: new Date(r.createdAt).toISOString(),
        validAt: r.validAt ? new Date(r.validAt).toISOString() : null,
        invalidAt: r.invalidAt ? new Date(r.invalidAt).toISOString() : null,
      })),
    };
  }

  async prefetch(
    query: string,
    opts?: { limit?: number; includeInvalid?: boolean },
  ): Promise<MemoryPrefetchResult> {
    return this.prefetchSync(query, opts);
  }

  async syncTurn(input: MemorySyncInput): Promise<void> {
    const text = truncate(
      `Issue session ${input.sessionId}\nUser:\n${input.userText}\n\nOutcome:\n${input.assistantText}`,
      4000,
    );
    this.addRaw(text, {
      issueId: input.issueId,
      agentId: input.agentId ?? null,
      runId: input.runId,
    });
  }

  /** curated / 直接写入（不套 User/Outcome 模板） */
  addRaw(
    text: string,
    meta?: {
      issueId?: string | null;
      agentId?: string | null;
      runId?: string | null;
    },
  ): MemoryItemView {
    const now = Date.now();
    const id = crypto.randomUUID();
    const issueId = meta?.issueId ?? null;
    const agentId = meta?.agentId ?? null;
    const runId = meta?.runId ?? null;
    const ins = db.insert(memoryItems)
      .values({
        id,
        scope: 'workspace',
        issueId,
        agentId,
        runId,
        text,
        createdAt: now,
      })
      .run();
    // G4-1：FTS 同步（rowid = memory_item rowid；gram 化文本）
    const rowid = Number(ins.lastInsertRowid);
    sqlite
      .prepare(`INSERT INTO ${FTS_TABLE}(rowid, text) VALUES (?, ?)`)
      .run(rowid, tokenize(text).join(' '));
    return {
      id,
      text,
      source: 'sqlite-text',
      issueId,
      runId,
      createdAt: new Date(now).toISOString(),
    };
  }

  deleteById(id: string): boolean {
    const row = db
      .select({ rowid: sql<number>`rowid` })
      .from(memoryItems)
      .where(eq(memoryItems.id, id))
      .get();
    const r = db.delete(memoryItems).where(eq(memoryItems.id, id)).run();
    if (row) {
      sqlite.prepare(`DELETE FROM ${FTS_TABLE} WHERE rowid = ?`).run(row.rowid);
    }
    return (r.changes ?? 0) > 0;
  }

  getById(id: string): MemoryItemView | null {
    const row = db.select().from(memoryItems).where(eq(memoryItems.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      text: row.text,
      source: 'sqlite-text',
      issueId: row.issueId ?? null,
      runId: row.runId ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      validAt: row.validAt ? new Date(row.validAt).toISOString() : null,
      invalidAt: row.invalidAt ? new Date(row.invalidAt).toISOString() : null,
    };
  }
  
  invalidateMemory(id: string): boolean {
    const r = db.update(memoryItems).set({ invalidAt: Date.now() }).where(eq(memoryItems.id, id)).run();
    return (r.changes ?? 0) > 0;
  }
}

