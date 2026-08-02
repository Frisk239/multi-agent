import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * G3-4 回归：POST/PATCH /api/agents 持久化 envVars/customArgs（JSON 文本列），
 * GET 回读解析为数组；null 清除语义。
 */

const insertValues = vi.fn();
const updateSet = vi.fn();
let selectGetValue: unknown = null;
const selectGet = vi.fn(() => selectGetValue);

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
  comments: {},
  workspaces: {},
  activityLogs: {},
}));

vi.mock('../db/reshape.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/reshape.js')>();
  const parseSafe = (raw: string | null | undefined): unknown => {
    if (!raw?.trim()) return [];
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  };
  return {
    ...actual,
    toAgentDetail: (row: { envVars?: string | null; customArgs?: string | null }) => ({
      id: 'agent-1',
      name: 'x',
      runtime: 'opencode',
      category: null,
      model: null,
      thinkingLevel: null,
      concurrency: 1,
      mcpServers: null,
      instructions: '',
      allowedPaths: null,
      invocationPermission: 'auto',
      archivedAt: null,
      liveStatus: 'idle',
      activeRunCount: 0,
      envVars: parseSafe(row.envVars) as { key: string; value: string }[],
      customArgs: parseSafe(row.customArgs) as string[],
    }),
  };
});

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
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
  const reply = {
    status: (code: number) => {
      state.statusCode = code;
      return reply;
    },
    send: (body: unknown) => {
      state.body = body;
    },
  };
  return { state, reply: reply as never };
}

async function callRoute(method: string, path: string, payload: unknown) {
  const { app, routes } = makeApp();
  await rosterRoutes(app);
  const { reply, state } = replyMock();
  const handler = routes[`${method} ${path}`];
  if (!handler) throw new Error(`no route ${method} ${path}`);
  const returned = await handler(
    method === 'GET' || method === 'DELETE' ? { params: { id: 'agent-1' } } : { params: { id: 'agent-1' }, body: payload },
    reply,
  );
  // fastify 语义：handler 直接 return 值也会成为响应体
  if (returned !== undefined && state.body === null) {
    state.body = returned;
  }
  return state;
}

describe('G3-4 agent envVars/customArgs persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectGetValue = null;
    selectGet.mockImplementation(() => selectGetValue);
  });

  it('POST /api/agents 携带 envVars/customArgs → insert JSON 序列化落库', async () => {
    const row = {
      id: 'agent-1',
      name: '测试',
      runtime: 'opencode',
      envVars: JSON.stringify([{ key: 'LANG', value: 'zh-CN' }]),
      customArgs: JSON.stringify(['--max-turns 40']),
    };
    // 第一次（existing 检查）→ 不存在；第二次（insert 后回读）→ 行
    selectGet.mockReturnValueOnce(null).mockReturnValue(row);
    const state = await callRoute('POST', '/api/agents', {
      name: '测试',
      runtime: 'opencode',
      envVars: [{ key: 'LANG', value: 'zh-CN' }],
      customArgs: ['--max-turns 40'],
    });
    expect(state.statusCode).toBe(201);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: JSON.stringify([{ key: 'LANG', value: 'zh-CN' }]),
        customArgs: JSON.stringify(['--max-turns 40']),
      }),
    );
    expect((state.body as { envVars: unknown }).envVars).toEqual([
      { key: 'LANG', value: 'zh-CN' },
    ]);
    expect((state.body as { customArgs: unknown }).customArgs).toEqual(['--max-turns 40']);
  });

  it('PATCH /api/agents 更新 envVars/customArgs → update JSON 落库 + 回读', async () => {
    selectGetValue = {
      id: 'agent-1',
      name: '测试',
      runtime: 'opencode',
      envVars: JSON.stringify([{ key: 'NEW', value: '1' }]),
      customArgs: JSON.stringify(['--verbose']),
    };
    const state = await callRoute('PATCH', '/api/agents/:id', {
      envVars: [{ key: 'NEW', value: '1' }],
      customArgs: ['--verbose'],
    });
    expect(state.statusCode).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: JSON.stringify([{ key: 'NEW', value: '1' }]),
        customArgs: JSON.stringify(['--verbose']),
      }),
    );
    expect((state.body as { envVars: unknown }).envVars).toEqual([{ key: 'NEW', value: '1' }]);
  });

  it('PATCH envVars=null → 清除（update null）', async () => {
    selectGetValue = {
      id: 'agent-1',
      name: '测试',
      runtime: 'opencode',
      envVars: null,
      customArgs: null,
    };
    const state = await callRoute('PATCH', '/api/agents/:id', {
      envVars: null,
      customArgs: null,
    });
    expect(state.statusCode).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ envVars: null, customArgs: null }),
    );
    expect((state.body as { envVars: unknown }).envVars).toEqual([]);
  });

  it('PATCH 非法 envVars（非数组）→ 400 validation', async () => {
    const state = await callRoute('PATCH', '/api/agents/:id', {
      envVars: 'not-an-array',
    });
    expect(state.statusCode).toBe(400);
  });

  it('GET /api/agents/:id 回读 envVars 为数组（脏 JSON 容错为空）', async () => {
    selectGetValue = {
      id: 'agent-1',
      name: '测试',
      runtime: 'opencode',
      envVars: '{broken json',
      customArgs: null,
    };
    const state = await callRoute('GET', '/api/agents/:id', null);
    expect(state.statusCode).toBe(200);
    expect((state.body as { envVars: unknown }).envVars).toEqual([]);
    expect((state.body as { customArgs: unknown }).customArgs).toEqual([]);
  });
});
