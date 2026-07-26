import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqlite } from '../db/client.js';
import { memoryItems } from '../db/schema.js';
import { SqliteTextProvider } from './sqlite-text-provider.js';
import { eq } from 'drizzle-orm';

describe('SqliteTextProvider - Temporal Validity', () => {
  let provider: SqliteTextProvider;

  beforeEach(() => {
    provider = new SqliteTextProvider();
    provider.initialize();
    sqlite.exec('DROP TABLE IF EXISTS memory_item;');
    sqlite.exec(`CREATE TABLE memory_item (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'workspace',
      issue_id TEXT,
      agent_id TEXT,
      run_id TEXT,
      text TEXT NOT NULL,
      valid_at INTEGER,
      invalid_at INTEGER,
      created_at INTEGER NOT NULL
    );`);
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
