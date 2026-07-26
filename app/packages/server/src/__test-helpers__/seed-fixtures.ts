import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { LOCAL_MEMBER } from '../local-member.js';

export function seedTestFixtures(db: BetterSQLite3Database<typeof schema>) {
  const NOW = Date.now();
  const WS_ID = 'ws-local';

  db.insert(schema.workspaces)
    .values({ id: WS_ID, name: 'Test Workspace', description: 'Test environment workspace', createdAt: NOW })
    .run();

  db.insert(schema.users)
    .values({ id: LOCAL_MEMBER.id, name: LOCAL_MEMBER.name, email: 'test@example.com', createdAt: NOW })
    .run();

  db.insert(schema.agents)
    .values([
      { id: 'agt-test-1', name: 'Test Agent 1', category: 'Testing', runtime: 'opencode', model: 'opencode/test', concurrency: 2, createdAt: NOW },
      { id: 'agt-test-2', name: 'Test Agent 2', category: 'Testing', runtime: 'claude-code', model: 'claude-3-5-sonnet', concurrency: 1, createdAt: NOW },
    ])
    .run();

  db.insert(schema.squads)
    .values({
      id: 'sqd-test-1',
      name: 'Test Squad',
      leaderId: 'agt-test-1',
      operatingProtocol: 'Protocol',
      missionDirective: 'Directive',
      createdAt: NOW,
    })
    .run();

  db.insert(schema.squadMembers)
    .values([
      { squadId: 'sqd-test-1', agentId: 'agt-test-1' },
      { squadId: 'sqd-test-1', agentId: 'agt-test-2' },
    ])
    .run();

  db.insert(schema.issues)
    .values([
      {
        id: 'iss-test-1',
        workspaceId: WS_ID,
        identifier: 'FRI-1',
        title: 'Test Issue 1',
        description: 'Test description',
        status: 'todo',
        priority: 'high',
        assigneeType: 'agent',
        assigneeId: 'agt-test-1',
        creatorType: 'member',
        creatorId: LOCAL_MEMBER.id,
        position: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .run();

  return {
    workspaceId: WS_ID,
    userId: LOCAL_MEMBER.id,
    agentIds: ['agt-test-1', 'agt-test-2'],
    squadId: 'sqd-test-1',
    issueId: 'iss-test-1',
  };
}
