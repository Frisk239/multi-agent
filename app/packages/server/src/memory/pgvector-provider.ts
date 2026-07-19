// S10 PgvectorProvider（spec §6，余弦检索抄 mem0-ts）
import { randomUUID } from 'node:crypto';
import {
  getMemoryDatabaseUrl,
  memoryPgQuery,
  closeMemoryPgPool,
} from '../db/pg-memory.js';
import {
  embedQuery,
  embedTexts,
  getEmbeddingConfig,
  vectorLiteral,
} from './embedder.js';
import type {
  MemoryItemView,
  MemoryPrefetchResult,
  MemoryProvider,
  MemorySyncInput,
} from './types.js';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

// 注意：vector(N) 不能参数化。initialize 时用 dims 拼 SQL（dims 来自 env 整数）。

export class PgvectorProvider implements MemoryProvider {
  readonly name = 'pgvector';
  private ready = false;

  isAvailable(): boolean {
    return (
      this.ready &&
      Boolean(getMemoryDatabaseUrl()) &&
      Boolean(getEmbeddingConfig().apiKey)
    );
  }

  async initialize(): Promise<void> {
    if (!getMemoryDatabaseUrl()) {
      this.ready = false;
      return;
    }
    const { dims } = getEmbeddingConfig();
    if (!Number.isInteger(dims) || dims <= 0) {
      throw new Error('EMBEDDING_DIMS 非法');
    }

    await memoryPgQuery('CREATE EXTENSION IF NOT EXISTS vector');
    await memoryPgQuery(`
CREATE TABLE IF NOT EXISTS memory_vectors (
  id UUID PRIMARY KEY,
  text TEXT NOT NULL,
  embedding vector(${dims}) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  issue_id TEXT,
  agent_id TEXT,
  run_id TEXT,
  scope TEXT NOT NULL DEFAULT 'workspace',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`);
    // HNSW 可能已存在或小数据时创建失败
    try {
      await memoryPgQuery(`
CREATE INDEX IF NOT EXISTS memory_vectors_hnsw
  ON memory_vectors USING hnsw (embedding vector_cosine_ops)`);
    } catch (e) {
      console.warn('[pgvector] HNSW index skip:', e);
    }
    await memoryPgQuery(
      `CREATE INDEX IF NOT EXISTS memory_vectors_issue ON memory_vectors (issue_id)`,
    );
    await memoryPgQuery(
      `CREATE INDEX IF NOT EXISTS memory_vectors_created ON memory_vectors (created_at DESC)`,
    );
    this.ready = true;
  }

  async prefetch(
    query: string,
    opts?: { sessionId?: string; limit?: number },
  ): Promise<MemoryPrefetchResult> {
    if (!this.isAvailable()) return { items: [] };
    const limit = opts?.limit ?? 5;
    const q = query.trim();
    if (!q) {
      const r = await memoryPgQuery<{
        id: string;
        text: string;
        issue_id: string | null;
        run_id: string | null;
        created_at: Date;
      }>(
        `SELECT id, text, issue_id, run_id, created_at
         FROM memory_vectors ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return {
        items: r.rows.map((row) => ({
          id: row.id,
          text: row.text,
          source: 'pgvector',
          issueId: row.issue_id,
          runId: row.run_id,
          createdAt: new Date(row.created_at).toISOString(),
        })),
      };
    }
    const vec = await embedQuery(q);
    const lit = vectorLiteral(vec);
    const r = await memoryPgQuery<{
      id: string;
      text: string;
      issue_id: string | null;
      run_id: string | null;
      created_at: Date;
      score: number;
    }>(
      `SELECT id, text, issue_id, run_id, created_at,
              GREATEST(0, 1 - (embedding <=> $1::vector))::float8 AS score
       FROM memory_vectors
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [lit, limit],
    );
    return {
      items: r.rows.map((row) => ({
        id: row.id,
        text: row.text,
        score: Number(row.score),
        source: 'pgvector',
        issueId: row.issue_id,
        runId: row.run_id,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }

  async syncTurn(input: MemorySyncInput): Promise<void> {
    const text = truncate(
      `Issue session ${input.sessionId}\nUser:\n${input.userText}\n\nOutcome:\n${input.assistantText}`,
      4000,
    );
    await this.insert(text, {
      issueId: input.issueId,
      agentId: input.agentId ?? null,
      runId: input.runId,
      source: 'run-sync',
    });
  }

  addRaw(
    text: string,
    meta?: {
      issueId?: string | null;
      agentId?: string | null;
      runId?: string | null;
    },
  ): Promise<MemoryItemView> {
    return this.insert(text, {
      issueId: meta?.issueId ?? null,
      agentId: meta?.agentId ?? null,
      runId: meta?.runId ?? null,
      source: 'curated',
    });
  }

  private async insert(
    text: string,
    meta: {
      issueId: string | null;
      agentId: string | null;
      runId: string | null;
      source: string;
    },
  ): Promise<MemoryItemView> {
    if (!this.isAvailable()) throw new Error('pgvector provider 不可用');
    const id = randomUUID();
    const [embedding] = await embedTexts([text]);
    const lit = vectorLiteral(embedding);
    await memoryPgQuery(
      `INSERT INTO memory_vectors
        (id, text, embedding, metadata, issue_id, agent_id, run_id, scope, source)
       VALUES ($1, $2, $3::vector, '{}'::jsonb, $4, $5, $6, 'workspace', $7)`,
      [id, text, lit, meta.issueId, meta.agentId, meta.runId, meta.source],
    );
    return {
      id,
      text,
      source: 'pgvector',
      issueId: meta.issueId,
      runId: meta.runId,
      createdAt: new Date().toISOString(),
    };
  }

  async deleteById(id: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const res = await memoryPgQuery(`DELETE FROM memory_vectors WHERE id = $1`, [id]);
    // node-pg: rowCount
    const n = (res as { rowCount?: number | null }).rowCount ?? 0;
    return n > 0;
  }

  async shutdown(): Promise<void> {
    this.ready = false;
    await closeMemoryPgPool();
  }
}
