import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 回归：POST/PATCH /api/agents 必须持久化 allowedPaths。
 */

const insertValues = vi.fn();
const updateSet = vi.fn();
const selectGet = vi.fn();

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: selectGet,
        }),
        all: () => [],
      }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v);
        return { run: vi.fn() };
      },
    }),
    update: () => ({
      set: (v: unknown) => {
        updateSet(v);
        return {
          where: () => ({
            run: vi.fn(),
          }),
        };
      },
    }),
    delete: () => ({
      where: () => ({ run: vi.fn() }),
    }),
  },
  sqlite: {
    transaction: (fn: () => void) => () => fn(),
  },
}));

vi.mock('../db/schema.js', () => ({
  agents: { id: 'id' },
  agentRuns: { id: 'id', agentId: 'agentId', status: 'status', createdAt: 'createdAt' },
  issues: {},
  squadMembers: {},
  squads: {},
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (x: unknown) => x,
  eq: (a: unknown, b: unknown) => ({ a, b }),
  gte: (a: unknown, b: unknown) => ({ a, b }),
  inArray: (a: unknown, b: unknown) => ({ a, b }),
  sql: (strings: TemplateStringsArray, ..._v: unknown[]) => strings.join(''),
}));

vi.mock('../db/reshape.js', () => ({
  toAgentDetail: (row: Record<string, unknown>) => row,
  toAgentRun: (row: unknown) => row,
  toAgentSummary: (row: unknown) => row,
}));

vi.mock('../db/squad-loader.js', () => ({
  loadSquadDetail: vi.fn(),
}));

vi.mock('../orchestration/readiness.js', () => ({
  computeAgentReadiness: vi.fn(),
}));

import { rosterRoutes } from './roster.js';

type Handler = (req: unknown, reply?: unknown) => Promise<unknown> | unknown;

function makeApp() {
  const routes: Record<string, Handler> = {};
  const app = {
    get: (path: string, handler: Handler) => {
      routes[`GET ${path}`] = handler;
    },
    post: (path: string, handler: Handler) => {
      routes[`POST ${path}`] = handler;
    },
    patch: (path: string, handler: Handler) => {
      routes[`PATCH ${path}`] = handler;
    },
    delete: (path: string, handler: Handler) => {
      routes[`DELETE ${path}`] = handler;
    },
  };
  return { app: app as never, routes };
}

function replyMock() {
  const r: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof r;
    send: (body: unknown) => unknown;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
  };
  return r;
}

describe('roster allowedPaths persistence', () => {
  beforeEach(() => {
    insertValues.mockReset();
    updateSet.mockReset();
    selectGet.mockReset();
  });

  it('POST /api/agents persists allowedPaths', async () => {
    selectGet
      .mockReturnValueOnce(null) // existing check
      .mockReturnValueOnce({
        id: 'agt-paths',
        name: 'Path Agent',
        runtime: 'opencode',
        model: null,
        thinkingLevel: null,
        category: null,
        concurrency: 1,
        instructions: '',
        allowedPaths: './src',
        mcpServers: null,
        archivedAt: null,
        createdAt: Date.now(),
      });

    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/agents'](
      {
        body: {
          id: 'agt-paths',
          name: 'Path Agent',
          runtime: 'opencode',
          allowedPaths: './src',
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(insertValues).toHaveBeenCalled();
    const vals = insertValues.mock.calls[0][0] as { allowedPaths?: string | null };
    expect(vals.allowedPaths).toBe('./src');
  });

  it('PATCH /api/agents/:id updates allowedPaths', async () => {
    selectGet.mockReturnValue({
      id: 'agt-1',
      name: 'A',
      runtime: 'opencode',
      model: null,
      thinkingLevel: null,
      category: null,
      concurrency: 1,
      instructions: '',
      allowedPaths: null,
      mcpServers: null,
      archivedAt: null,
      createdAt: Date.now(),
    });

    const { app, routes } = makeApp();
    await rosterRoutes(app);
    await routes['PATCH /api/agents/:id'](
      {
        params: { id: 'agt-1' },
        body: { allowedPaths: './packages/web' },
      },
      replyMock(),
    );

    expect(updateSet).toHaveBeenCalled();
    const patch = updateSet.mock.calls[0][0] as { allowedPaths?: string | null };
    expect(patch.allowedPaths).toBe('./packages/web');
  });
});
