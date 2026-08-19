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
  MemoryPrefetchScope,
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
  project_id TEXT,
  scope TEXT NOT NULL DEFAULT 'workspace',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_at TIMESTAMPTZ,
  invalid_at TIMESTAMPTZ
)`);
    // Fallback if table already existed without these columns
    await memoryPgQuery(`ALTER TABLE memory_vectors ADD COLUMN IF NOT EXISTS project_id TEXT;`);
    await memoryPgQuery(`ALTER TABLE memory_vectors ADD COLUMN IF NOT EXISTS valid_at TIMESTAMPTZ;`);
    await memoryPgQuery(`ALTER TABLE memory_vectors ADD COLUMN IF NOT EXISTS invalid_at TIMESTAMPTZ;`);

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
    opts?: {
      sessionId?: string;
      limit?: number;
      includeInvalid?: boolean;
      scope?: MemoryPrefetchScope;
      projectId?: string | null;
    },
  ): Promise<MemoryPrefetchResult> {
    if (!this.isAvailable()) return { items: [] };
    const limit = opts?.limit ?? 5;
    const includeInvalid = opts?.includeInvalid ?? false;
    const scope = opts?.scope ?? null;
    const projectFilter = opts?.projectId !== undefined;
    const projectId = opts?.projectId ?? null;
    const q = query.trim();

    const condition = includeInvalid ? '1 = 1' : '(invalid_at IS NULL OR invalid_at > now())';
    // G4-4：scope 过滤
    const scopeClause = scope ? ` AND scope = '${scope.replace(/'/g, "''")}'` : '';
    const projectClause = projectFilter
      ? projectId
        ? ' AND (project_id = $2 OR project_id IS NULL)'
        : ' AND project_id IS NULL'
      : '';

    if (!q) {
      const r = await memoryPgQuery<{
        id: string;
        text: string;
        issue_id: string | null;
        run_id: string | null;
        project_id: string | null;
        created_at: Date;
        valid_at: Date | null;
        invalid_at: Date | null;
      }>(
        `SELECT id, text, issue_id, run_id, project_id, created_at, valid_at, invalid_at
         FROM memory_vectors WHERE ${condition}${scopeClause}${projectClause} ORDER BY created_at DESC LIMIT $${projectFilter && projectId ? 2 : 1}`,
        projectFilter && projectId ? [projectId, limit] : [limit],
      );
      return {
        items: r.rows.map((row) => ({
          id: row.id,
          text: row.text,
          source: 'pgvector',
          issueId: row.issue_id,
          projectId: row.project_id,
          runId: row.run_id,
          createdAt: new Date(row.created_at).toISOString(),
          validAt: row.valid_at ? new Date(row.valid_at).toISOString() : null,
          invalidAt: row.invalid_at ? new Date(row.invalid_at).toISOString() : null,
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
      project_id: string | null;
      created_at: Date;
      valid_at: Date | null;
      invalid_at: Date | null;
      score: number;
    }>(
      `SELECT id, text, issue_id, run_id, project_id, created_at, valid_at, invalid_at,
              GREATEST(0, 1 - (embedding <=> $1::vector))::float8 AS score
       FROM memory_vectors
       WHERE ${condition}${scopeClause}${projectClause}
       ORDER BY embedding <=> $1::vector
       LIMIT $${projectFilter && projectId ? 3 : 2}`,
      projectFilter && projectId ? [lit, projectId, limit] : [lit, limit],
    );
    return {
      items: r.rows.map((row) => ({
        id: row.id,
        text: row.text,
        score: Number(row.score),
        source: 'pgvector',
        issueId: row.issue_id,
        projectId: row.project_id,
        runId: row.run_id,
        createdAt: new Date(row.created_at).toISOString(),
        validAt: row.valid_at ? new Date(row.valid_at).toISOString() : null,
        invalidAt: row.invalid_at ? new Date(row.invalid_at).toISOString() : null,
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
      projectId: input.projectId ?? null,
      agentId: input.agentId ?? null,
      runId: input.runId,
      source: 'run-sync',
      scope: input.scope ?? 'run',
    });
  }

  addRaw(
    text: string,
    meta?: {
      issueId?: string | null;
      agentId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      scope?: MemoryPrefetchScope;
    },
  ): Promise<MemoryItemView> {
    return this.insert(text, {
      issueId: meta?.issueId ?? null,
      projectId: meta?.projectId ?? null,
      agentId: meta?.agentId ?? null,
      runId: meta?.runId ?? null,
      source: 'curated',
      scope: meta?.scope ?? 'workspace',
    });
  }

  private async insert(
    text: string,
    meta: {
      issueId: string | null;
      agentId: string | null;
      runId: string | null;
      projectId: string | null;
      source: string;
      scope: string;
    },
  ): Promise<MemoryItemView> {
    if (!this.isAvailable()) throw new Error('pgvector provider 不可用');
    const id = randomUUID();
    const [embedding] = await embedTexts([text]);
    const lit = vectorLiteral(embedding);
    await memoryPgQuery(
      `INSERT INTO memory_vectors
        (id, text, embedding, metadata, issue_id, agent_id, run_id, project_id, scope, source)
       VALUES ($1, $2, $3::vector, '{}'::jsonb, $4, $5, $6, $7, $8, $9)`,
      [id, text, lit, meta.issueId, meta.agentId, meta.runId, meta.projectId, meta.scope, meta.source],
    );
    return {
      id,
      text,
      source: 'pgvector',
      scope: meta.scope,
      issueId: meta.issueId,
      projectId: meta.projectId,
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

  async getById(id: string): Promise<MemoryItemView | null> {
    if (!this.isAvailable()) return null;
    const r = await memoryPgQuery<{
      id: string;
      text: string;
      issue_id: string | null;
      run_id: string | null;
      project_id: string | null;
      created_at: Date;
      valid_at: Date | null;
      invalid_at: Date | null;
    }>(
      `SELECT id, text, issue_id, run_id, project_id, created_at, valid_at, invalid_at FROM memory_vectors WHERE id = $1`,
      [id],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      text: row.text,
      source: 'pgvector',
      issueId: row.issue_id,
      projectId: row.project_id,
      runId: row.run_id,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
      validAt: row.valid_at ? new Date(row.valid_at).toISOString() : null,
      invalidAt: row.invalid_at ? new Date(row.invalid_at).toISOString() : null,
    };
  }
  
  async invalidateMemory(id: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const res = await memoryPgQuery(`UPDATE memory_vectors SET invalid_at = now() WHERE id = $1`, [id]);
    const n = (res as { rowCount?: number | null }).rowCount ?? 0;
    return n > 0;
  }

  async shutdown(): Promise<void> {
    this.ready = false;
    await closeMemoryPgPool();
  }
}
