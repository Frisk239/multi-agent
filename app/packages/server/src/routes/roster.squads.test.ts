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
const orderByArgs: { args: unknown } = { args: null };

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: selectGet,
          all: selectAll,
          // B5/归档列表：where(...).orderBy(...).all() 链
          orderBy: (...args: unknown[]) => {
            orderByArgs.args = args;
            return { all: selectAll };
          },
          innerJoin: () => ({
            where: () => ({ all: selectAll }),
          }),
        }),
        all: selectAll,
        // B5：GET /api/squads 排序链
        orderBy: (...args: unknown[]) => {
          orderByArgs.args = args;
          return { all: selectAll };
        },
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
  activityLogs: {
    id: 'id',
    issueId: 'issueId',
    actorType: 'actorType',
    actorId: 'actorId',
    actorName: 'actorName',
    eventType: 'eventType',
    payload: 'payload',
    createdAt: 'createdAt',
  },
  agents: { id: 'id', archivedAt: 'archivedAt' },
  agentRuns: { id: 'id', agentId: 'agentId', status: 'status', createdAt: 'createdAt' },
  automationRules: {
    assigneeType: 'assigneeType',
    assigneeId: 'assigneeId',
    archivedAt: 'archivedAt',
    updatedAt: 'updatedAt',
  },
  issues: {
    id: 'id',
    assigneeType: 'assigneeType',
    assigneeId: 'assigneeId',
    status: 'status',
    identifier: 'identifier',
    updatedAt: 'updatedAt',
  },
  squadMembers: { squadId: 'squadId', agentId: 'agentId' },
  squads: {
    id: 'id',
    name: 'name',
    leaderId: 'leaderId',
    archivedAt: 'archivedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (x: unknown) => x,
  eq: (a: unknown, b: unknown) => ({ a, b }),
  gte: (a: unknown, b: unknown) => ({ a, b }),
  inArray: (a: unknown, b: unknown) => ({ a, b }),
  isNull: (x: unknown) => ({ op: 'isNull', x }),
  sql: (strings: TemplateStringsArray, ..._v: unknown[]) => strings.join(''),
}));

vi.mock('../db/reshape.js', () => ({
  loadChildProgressByParentIds: vi.fn(() => new Map()),
  loadLabelsByIssueIds: vi.fn(() => new Map()),
  loadParentIdentifiers: vi.fn(() => new Map()),
  loadProjectTitles: vi.fn(() => new Map()),
  toAgentDetail: (row: Record<string, unknown>) => row,
  toAgentRun: (row: unknown) => row,
  toAgentSummary: (row: unknown) => row,
  toIssue: (row: unknown) => row,
  toObservedAgentRun: (row: unknown) => row,
}));

vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: vi.fn() },
}));

vi.mock('../orchestration/activity-logger.js', () => ({
  publishActivityCreated: vi.fn(),
}));

vi.mock('../db/squad-loader.js', () => ({
  loadSquadDetail: vi.fn(),
}));

vi.mock('../orchestration/readiness.js', () => ({
  computeAgentReadiness: vi.fn(),
}));

import { rosterRoutes } from './roster.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { eventBus } from '../orchestration/event-bus.js';
import { publishActivityCreated } from '../orchestration/activity-logger.js';

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
const mockEventBus = vi.mocked(eventBus);
const mockPublishActivityCreated = vi.mocked(publishActivityCreated);

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
    const vals = insertValues.mock.calls[0][0] as { name: string; leaderId: string; createdAt: number; updatedAt: number };
    expect(vals.name).toBe('Alpha');
    expect(vals.leaderId).toBe('agt-1');
    // B5：create 即写 updatedAt
    expect(vals.createdAt).toBeTypeOf('number');
    expect(vals.updatedAt).toBeTypeOf('number');
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
    const patch = updateSet.mock.calls[0][0] as { name: string; updatedAt?: number };
    expect(patch.name).toBe('New Name');
    // B5：改名刷 updatedAt
    expect(patch.updatedAt).toBeTypeOf('number');
  });

  it('B5: memberIds-only patch also refreshes updatedAt', async () => {
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
    const patch = updateSet.mock.calls[0][0] as { updatedAt?: number };
    expect(patch.updatedAt).toBeTypeOf('number');
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

describe('GET /api/squads (B5 排序)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderByArgs.args = null;
  });

  it('按 updatedAt desc、createdAt desc 兜底排序', async () => {
    selectAll.mockReturnValue([]);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    const result = await routes['GET /api/squads'](undefined, reply);
    expect(orderByArgs.args).not.toBeNull();
    const [first, second] = orderByArgs.args as [unknown, unknown];
    expect(first).toBe('updatedAt');
    expect(second).toBe('createdAt');
    expect(result).toEqual([]);
  });

  it('F6-3: 下发 memberIds（一次查全表按 squadId 分组），无成员 squad → []', async () => {
    // 第一次 all：squad 行；第二次 all：squad_member 全表
    selectAll
      .mockReturnValueOnce([
        { id: 'sqd-1', name: 'A', leaderId: 'agt-1', createdAt: 1, updatedAt: 2 },
        { id: 'sqd-2', name: 'B', leaderId: 'agt-2', createdAt: 1, updatedAt: 2 },
      ])
      .mockReturnValueOnce([
        { squadId: 'sqd-1', agentId: 'agt-10' },
        { squadId: 'sqd-1', agentId: 'agt-11' },
      ]);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    const result = (await routes['GET /api/squads'](undefined, reply)) as Array<{
      id: string;
      memberIds: string[];
      memberCount: number;
    }>;
    const byId = new Map(result.map((s) => [s.id, s]));
    expect(byId.get('sqd-1')!.memberIds).toEqual(['agt-10', 'agt-11']);
    expect(byId.get('sqd-1')!.memberCount).toBe(2);
    expect(byId.get('sqd-2')!.memberIds).toEqual([]);
    expect(byId.get('sqd-2')!.memberCount).toBe(0);
  });
});

describe('DELETE /api/squads/:id（G2-9 归档语义）', () => {
  beforeEach(() => {
    // clearAllMocks 只清调用记录，Once 队列/返回值会跨 describe 泄漏，
    // 而归档事务对 select 链的调用次数敏感，必须完全重置。
    selectGet.mockReset();
    selectAll.mockReset();
    updateSet.mockReset();
    insertValues.mockReset();
    deleteWhere.mockReset();
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

  it('returns 204 idempotent when squad already archived, no duplicate audit', async () => {
    selectGet.mockReturnValueOnce({
      id: 'sqd-1',
      name: 'Old',
      leaderId: 'agt-1',
      archivedAt: '2026-08-19T00:00:00.000Z',
    });
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['DELETE /api/squads/:id'](
      { params: { id: 'sqd-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(204);
    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('returns 409 with zero side effects when former leader missing or archived', async () => {
    selectGet
      .mockReturnValueOnce({ id: 'sqd-1', name: 'Busy', leaderId: 'agt-1', archivedAt: null })
      .mockReturnValueOnce(null);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['DELETE /api/squads/:id'](
      { params: { id: 'sqd-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(409);
    expect((reply.body as { error?: string }).error).toContain('former leader');
    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('archives squad: transfers issues + active automation rules to leader, writes audit, no hard delete', async () => {
    const existing = { id: 'sqd-1', name: 'Done', leaderId: 'agt-1', archivedAt: null };
    const leader = { id: 'agt-1', name: 'Leader', archivedAt: null };
    selectGet
      // initial load
      .mockReturnValueOnce(existing)
      // initial leader check
      .mockReturnValueOnce(leader)
      // transaction: reload current squad
      .mockReturnValueOnce(existing)
      // transaction: repeat leader check
      .mockReturnValueOnce(leader);
    // transaction: transferred issues (status does not gate transfer)
    selectAll.mockReturnValueOnce([
      {
        id: 'iss-1',
        identifier: 'FRI-1',
        status: 'in_progress',
        assigneeType: 'squad',
        assigneeId: 'sqd-1',
      },
    ]);
    const { app, routes } = makeApp();
    await rosterRoutes(app);
    const reply = replyMock();
    await routes['DELETE /api/squads/:id'](
      { params: { id: 'sqd-1' } },
      reply,
    );
    expect(reply.statusCode).toBe(204);
    // issue transfer + automation rule transfer + squad archive mark
    expect(updateSet).toHaveBeenCalledTimes(3);
    expect(updateSet.mock.calls[0][0]).toEqual(
      expect.objectContaining({ assigneeType: 'agent', assigneeId: 'agt-1' }),
    );
    expect(updateSet.mock.calls[1][0]).toEqual(
      expect.objectContaining({ assigneeType: 'agent', assigneeId: 'agt-1' }),
    );
    expect(updateSet.mock.calls[2][0]).toEqual(
      expect.objectContaining({ archivedAt: expect.any(Number) }),
    );
    // one traceable system assignee-change activity per transferred issue
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        issueId: 'iss-1',
        actorType: 'system',
        eventType: 'assignee_changed',
      }),
    );
    expect(String(insertValues.mock.calls[0][0].payload)).toContain('squad_archived');
    // archive never hard-deletes squad_members/squad rows
    expect(deleteWhere).not.toHaveBeenCalled();
    // broadcast strictly after commit
    expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
    expect(mockPublishActivityCreated).toHaveBeenCalledTimes(1);
  });
});
