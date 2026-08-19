import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './__test-helpers__/test-db.js';
import { seedTestFixtures } from './__test-helpers__/seed-fixtures.js';
import { agents } from './db/schema.js';
import { cleanLegacySecretLiterals, scanSecretSafety } from './secret-safety.js';

describe('G8-3 historical secret safety', () => {
  const cleanups: Array<() => void> = [];

  function setup() {
    const test = createTestDb();
    cleanups.push(test.cleanup);
    seedTestFixtures(test.db);
    return test;
  }

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  it('dry-run reports only safe metadata for legacy literals', () => {
    const { db, sqlite } = setup();
    db.update(agents)
      .set({
        envVars: JSON.stringify([
          { key: 'API_TOKEN', value: 'agent-secret-do-not-return' },
          { key: 'MA_VISIBLE', value: 'ordinary-value' },
        ]),
        mcpServers: JSON.stringify({
          github: {
            headers: { Authorization: 'Bearer mcp-secret-do-not-return', 'X-Trace': 'visible' },
            apiKey: 42,
            safeRef: '${env:NOT_A_SECRET_KEY}',
          },
        }),
      })
      .where(eq(agents.id, 'agt-test-1'))
      .run();

    const summary = scanSecretSafety(sqlite);
    expect(summary.status).toBe('known_legacy_literals_detected');
    expect(summary.findings).toHaveLength(3);
    expect(summary.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: 'agt-test-1', field: 'envVars', key: 'API_TOKEN' }),
        expect.objectContaining({ agentId: 'agt-test-1', field: 'mcpServers', key: 'Authorization' }),
        expect.objectContaining({ agentId: 'agt-test-1', field: 'mcpServers', key: 'apiKey' }),
      ]),
    );
    for (const finding of summary.findings) {
      expect(Object.keys(finding).sort()).toEqual([
        'agentId', 'field', 'fingerprint', 'key', 'length', 'path',
      ]);
      expect(finding.fingerprint).toMatch(/^[a-f0-9]{12}$/);
      expect(finding.length).toBeGreaterThan(0);
    }
    const visible = JSON.stringify(summary);
    expect(visible).not.toContain('agent-secret-do-not-return');
    expect(visible).not.toContain('mcp-secret-do-not-return');
  });

  it('apply clears every sensitive env JSON value and deletes sensitive MCP leaves without guessing envRef', () => {
    const { db, sqlite } = setup();
    db.update(agents)
      .set({
        envVars: JSON.stringify([
          { key: 'API_TOKEN', value: 'old-agent-secret' },
          { key: 'BOOL_SECRET', value: false },
          { key: 'OBJECT_CREDENTIAL', value: { nested: 'old-object-secret' } },
          { key: 'MA_VISIBLE', value: 'ordinary-value' },
        ]),
        mcpServers: JSON.stringify({
          github: {
            headers: { Authorization: 'Bearer old-mcp-secret', 'X-Trace': 'visible' },
            apiKey: '${env:GITHUB_TOKEN}',
            password: { unexpected: 'old-nested-secret' },
          },
        }),
      })
      .where(eq(agents.id, 'agt-test-1'))
      .run();

    const result = cleanLegacySecretLiterals(sqlite);
    expect(result.summary.status).toBe('known_legacy_literals_detected');
    expect(result.updatedAgents).toBe(1);
    expect(result.after.status).toBe('no_known_legacy_literals');
    expect(JSON.stringify(result.summary)).not.toContain('old-agent-secret');
    expect(JSON.stringify(result.summary)).not.toContain('old-mcp-secret');

    const row = db.select().from(agents).where(eq(agents.id, 'agt-test-1')).get();
    const env = JSON.parse(row!.envVars!);
    expect(env).toEqual([
      { key: 'API_TOKEN', value: '' },
      { key: 'BOOL_SECRET', value: '' },
      { key: 'OBJECT_CREDENTIAL', value: '' },
      { key: 'MA_VISIBLE', value: 'ordinary-value' },
    ]);
    const mcp = JSON.parse(row!.mcpServers!);
    expect(mcp).toEqual({
      github: {
        headers: { 'X-Trace': 'visible' },
        apiKey: '${env:GITHUB_TOKEN}',
      },
    });
    expect(row!.envVars).not.toContain('old-agent-secret');
    expect(row!.mcpServers).not.toContain('old-mcp-secret');
    expect(row!.mcpServers).not.toContain('old-nested-secret');
  });

  it('marks malformed legacy JSON inconclusive, then explicit apply clears the whole unsafe columns', () => {
    const { db, sqlite } = setup();
    db.update(agents)
      .set({ envVars: '{bad-env', mcpServers: '{bad-mcp' })
      .where(eq(agents.id, 'agt-test-1'))
      .run();

    const before = scanSecretSafety(sqlite);
    expect(before.status).toBe('scan_inconclusive');
    expect(before.findings).toHaveLength(2);
    expect(JSON.stringify(before)).not.toContain('{bad-env');
    expect(JSON.stringify(before)).not.toContain('{bad-mcp');

    const applied = cleanLegacySecretLiterals(sqlite);
    expect(applied.updatedAgents).toBe(1);
    expect(applied.summary.status).toBe('scan_inconclusive');
    expect(applied.after.status).toBe('no_known_legacy_literals');
    const row = db.select().from(agents).where(eq(agents.id, 'agt-test-1')).get();
    expect(row?.envVars).toBeNull();
    expect(row?.mcpServers).toBeNull();
  });
});
