import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/squads / PATCH /api/squads/:id / DELETE /api/squads/:id
 * Route-level tests（mock DB，对齐 roster.allowed-paths.test.ts 模式）
 */

const insertValues = vi.fn();
const updateSet = vi.fn();
const selectGet = vi.fn();
const selectAll = vi.fn();
const deleteWhere = vi.fn();

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: selectGet,
          all: selectAll,
          innerJoin: () => ({
            where: () => ({ all: selectAll }),
          }),
        }),
        all: selectAll,
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
      where: () => ({ run: deleteWhere }),
    }),
  },
  sqlite: {
    transaction: (fn: () => void) => () => fn(),
  },
}));

vi.mock('../db/schema.js', () => ({
  agents: { id: 'id', archivedAt: 'archivedAt' },
  agentRuns: { id: 'id', agentId: 'agentId', status: 'status', createdAt: 'createdAt' },
  issues: { id: 'id', assigneeType: 'assigneeType', assigneeId: 'assigneeId', status: 'status', identifier: 'identifier' },
  squadMembers: { squadId: 'squadId', agentId: 'agentId' },
  squads: { id: 'id', name: 'name', leaderId: 'leaderId' },
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
import { loadSquadDetail } from '../db/squad-loader.js';

type Handler = (req: unknown, reply?: unknown) => Promise<unknown> | unknown;

function makeApp() {
  const routes: Record<string, Handler> = {};
  const app = {
    get: (path: string, handler: Handler) => { routes[`GET ${path}`] = handler; },
    post: (path: string, handler: Handler) => { routes[`POST ${path}`] = handler; },
    patch: (path: string, handler: Handler) => { routes[`PATCH ${path}`] = handler; },
    delete: (path: string, handler: Handler) => { routes[`DELETE ${path}`] = handler; },
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
    status(code: number) { this.statusCode = code; return this; },
    send(body: unknown) { this.body = body; return body; },
  };
  return r;
}

const mockLoadSquadDetail = vi.mocked(loadSquadDetail);

describe('POST /api/squads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when name is empty', async () => {
    selectGet.mockReturnValue(null); // agent existence check
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: '', leaderId: 'agt-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when name exceeds 80 chars', async () => {
    selectGet.mockReturnValue(null);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: 'x'.repeat(81), leaderId: 'agt-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when leaderId is missing', async () => {
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: 'Alpha' } },
      reply,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('returns 400 when leader agent does not exist', async () => {
    selectGet.mockReturnValue(null); // agent check returns null
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: 'Alpha', leaderId: 'agt-nonexistent' } },
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as { error?: string }).error).toContain('leader 不存在');
  });

  it('returns 400 when a member agent does not exist', async () => {
    // first call: leader check → exists; second call: member check → null
    selectGet
      .mockReturnValueOnce({ id: 'agt-leader', name: 'Leader', archivedAt: null })
      .mockReturnValueOnce(null);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: 'Alpha', leaderId: 'agt-leader', memberIds: ['agt-bad'] } },
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as { error?: string }).error).toContain('member 不存在');
  });

  it('returns 409 when squad id already exists', async () => {
    // leader exists
    selectGet
      .mockReturnValueOnce({ id: 'agt-1', name: 'Agent 1', archivedAt: null })
      // squad id collision
      .mockReturnValueOnce({ id: 'sqd-custom' });
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { id: 'sqd-custom', name: 'Alpha', leaderId: 'agt-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(409);
    expect((reply.body as { error?: string }).error).toContain('squad id 已存在');
  });

  it('creates squad with valid input and returns 201', async () => {
    // leader exists
    selectGet
      .mockReturnValueOnce({ id: 'agt-1', name: 'Leader', archivedAt: null })
      // no squad id collision
      .mockReturnValueOnce(null);
    // loadSquadDetail returns detail
    mockLoadSquadDetail.mockReturnValue({
      id: 'sqd-new',
      name: 'Alpha',
      leaderId: 'agt-1',
      operatingProtocol: '',
      missionDirective: '',
      members: [],
    });

    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: 'Alpha', leaderId: 'agt-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(201);
    expect(insertValues).toHaveBeenCalled();
    const vals = insertValues.mock.calls[0][0] as { name: string; leaderId: string };
    expect(vals.name).toBe('Alpha');
    expect(vals.leaderId).toBe('agt-1');
  });

  it('creates squad with memberIds and persists squad_members', async () => {
    // Calls: 1) leader assertAgentExists 2) member assertAgentExists (validation loop)
    //        3) squad id collision check 4) member assertAgentExists (replaceSquadMembers)
    selectGet
      .mockReturnValueOnce({ id: 'agt-1', name: 'Leader', archivedAt: null }) // leader check
      .mockReturnValueOnce({ id: 'agt-2', name: 'Member', archivedAt: null }) // member validation
      .mockReturnValueOnce(null) // squad id collision → none
      .mockReturnValueOnce({ id: 'agt-2', name: 'Member', archivedAt: null }); // member in replaceSquadMembers
    mockLoadSquadDetail.mockReturnValue({
      id: 'sqd-new',
      name: 'Beta',
      leaderId: 'agt-1',
      operatingProtocol: '',
      missionDirective: '',
      members: [{ agentId: 'agt-2', name: 'Member' }],
    });

    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: 'Beta', leaderId: 'agt-1', memberIds: ['agt-2'] } },
      reply,
    );
    expect(reply.statusCode).toBe(201);
    // insertValues called twice: once for squad, once for squad_member
    expect(insertValues).toHaveBeenCalledTimes(2);
  });

  it('defaults operatingProtocol and missionDirective to empty string', async () => {
    selectGet
      .mockReturnValueOnce({ id: 'agt-1', name: 'Leader', archivedAt: null })
      .mockReturnValueOnce(null);
    mockLoadSquadDetail.mockReturnValue({
      id: 'sqd-new', name: 'X', leaderId: 'agt-1',
      operatingProtocol: '', missionDirective: '', members: [],
    });

    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['POST /api/squads'](
      { body: { name: 'X', leaderId: 'agt-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(201);
    const vals = insertValues.mock.calls[0][0] as {
      operatingProtocol: string;
      missionDirective: string;
    };
    expect(vals.operatingProtocol).toBe('');
    expect(vals.missionDirective).toBe('');
  });
});

describe('PATCH /api/squads/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on empty patch', async () => {
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['PATCH /api/squads/:id'](
      { params: { id: 'sqd-1' }, body: {} },
      reply,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('returns 404 when squad does not exist', async () => {
    selectGet.mockReturnValue(null);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['PATCH /api/squads/:id'](
      { params: { id: 'sqd-nonexistent' }, body: { name: 'New Name' } },
      reply,
    );
    expect(reply.statusCode).toBe(404);
  });

  it('returns 400 when new leader does not exist', async () => {
    selectGet
      .mockReturnValueOnce({ id: 'sqd-1', name: 'Old', leaderId: 'agt-1' }) // existing squad
      .mockReturnValueOnce(null); // leader check fails
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['PATCH /api/squads/:id'](
      { params: { id: 'sqd-1' }, body: { leaderId: 'agt-bad' } },
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as { error?: string }).error).toContain('leader 不存在');
  });

  it('returns 400 when a new member does not exist', async () => {
    selectGet
      .mockReturnValueOnce({ id: 'sqd-1', name: 'Old', leaderId: 'agt-1' }) // existing squad
      .mockReturnValueOnce(null); // member check fails
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['PATCH /api/squads/:id'](
      { params: { id: 'sqd-1' }, body: { memberIds: ['agt-bad'] } },
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as { error?: string }).error).toContain('member 不存在');
  });

  it('updates name and returns detail', async () => {
    selectGet.mockReturnValue({ id: 'sqd-1', name: 'Old', leaderId: 'agt-1' });
    mockLoadSquadDetail.mockReturnValue({
      id: 'sqd-1', name: 'New Name', leaderId: 'agt-1',
      operatingProtocol: '', missionDirective: '', members: [],
    });

    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['PATCH /api/squads/:id'](
      { params: { id: 'sqd-1' }, body: { name: 'New Name' } },
      reply,
    );
    expect(reply.statusCode).toBe(200);
    expect(updateSet).toHaveBeenCalled();
    const patch = updateSet.mock.calls[0][0] as { name: string };
    expect(patch.name).toBe('New Name');
  });

  it('updates memberIds and replaces squad_members', async () => {
    selectGet
      .mockReturnValueOnce({ id: 'sqd-1', name: 'S', leaderId: 'agt-1' }) // squad exists
      .mockReturnValueOnce({ id: 'agt-new', name: 'New', archivedAt: null }); // member valid
    mockLoadSquadDetail.mockReturnValue({
      id: 'sqd-1', name: 'S', leaderId: 'agt-1',
      operatingProtocol: '', missionDirective: '',
      members: [{ agentId: 'agt-new', name: 'New' }],
    });

    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['PATCH /api/squads/:id'](
      { params: { id: 'sqd-1' }, body: { memberIds: ['agt-new'] } },
      reply,
    );
    expect(reply.statusCode).toBe(200);
    // delete old members + insert new
    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalled();
  });
});

describe('DELETE /api/squads/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when squad does not exist', async () => {
    selectGet.mockReturnValue(null);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['DELETE /api/squads/:id'](
      { params: { id: 'sqd-nonexistent' } },
      reply,
    );
    expect(reply.statusCode).toBe(404);
  });

  it('returns 409 when squad is assigned to active issue', async () => {
    // squad exists
    selectGet
      .mockReturnValueOnce({ id: 'sqd-1', name: 'Busy', leaderId: 'agt-1' })
      // active issue assigned to this squad
      .mockReturnValueOnce({ id: 'iss-1', identifier: 'FRI-1', status: 'in_progress' });
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['DELETE /api/squads/:id'](
      { params: { id: 'sqd-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(409);
    expect((reply.body as { error?: string }).error).toContain('未完成 issue');
  });

  it('deletes squad with no active issues and returns 204', async () => {
    // squad exists
    selectGet
      .mockReturnValueOnce({ id: 'sqd-1', name: 'Done', leaderId: 'agt-1' })
      // no active issue
      .mockReturnValueOnce(null);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['DELETE /api/squads/:id'](
      { params: { id: 'sqd-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(204);
    // delete squad_members then squad
    expect(deleteWhere).toHaveBeenCalledTimes(2);
  });
});
