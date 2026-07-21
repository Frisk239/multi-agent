import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
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

export class SqliteTextProvider implements MemoryProvider {
  readonly name = 'sqlite-text';

  isAvailable(): boolean {
    return true;
  }

  initialize(): void {
    // no-op：表靠 migration
  }

  prefetchSync(query: string, opts?: { limit?: number }): MemoryPrefetchResult {
    const limit = opts?.limit ?? 5;
    const tokens = tokenize(query);
    let rows;
    if (tokens.length === 0) {
      rows = db
        .select()
        .from(memoryItems)
        .orderBy(desc(memoryItems.createdAt))
        .limit(limit)
        .all();
    } else {
      // 简化：取最近 200 条再内存过滤（S09 数据量小）
      const all = db
        .select()
        .from(memoryItems)
        .orderBy(desc(memoryItems.createdAt))
        .limit(200)
        .all();
      // 收紧：须命中全部 token（AND）；分值=匹配次数 + 整串命中加权
      const needle = query.trim().toLowerCase();
      rows = all
        .map((r) => {
          const lower = r.text.toLowerCase();
          let hits = 0;
          for (const t of tokens) {
            if (lower.includes(t.toLowerCase())) hits += 1;
          }
          if (hits < tokens.length) return { r, score: 0 };
          let score = hits;
          if (needle && lower.includes(needle)) score += 2;
          return { r, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.r.createdAt - a.r.createdAt)
        .slice(0, limit)
        .map((x) => x.r);
    }
    return {
      items: rows.map((r) => ({
        id: r.id,
        text: r.text,
        source: 'sqlite-text',
        issueId: r.issueId,
        runId: r.runId,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    };
  }

  async prefetch(
    query: string,
    opts?: { limit?: number },
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
    db.insert(memoryItems)
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
    const r = db.delete(memoryItems).where(eq(memoryItems.id, id)).run();
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
    };
  }
}
