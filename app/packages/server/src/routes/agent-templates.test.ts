import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AGENT_TEMPLATES, getAgentTemplate } from '@ma/shared';

/**
 * 路由层轻量单测：不启动 Fastify 全栈，验证模板清单与 create-from-template 契约。
 * e2e 骨架见文件末尾。
 */

const insertValues = vi.fn();
const selectGet = vi.fn();

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: selectGet,
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v);
        return { run: vi.fn() };
      },
    }),
  },
}));

vi.mock('../db/schema.js', () => ({
  agents: {
    id: 'id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));

vi.mock('../db/reshape.js', () => ({
  toAgentDetail: (row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    runtime: row.runtime,
    category: row.category ?? null,
    model: row.model ?? null,
    thinkingLevel: row.thinkingLevel ?? null,
    concurrency: row.concurrency,
    mcpServers: row.mcpServers ?? null,
    instructions: row.instructions ?? '',
    allowedPaths: row.allowedPaths ?? null,
    archivedAt: null,
    liveStatus: 'idle',
    activeRunCount: 0,
  }),
}));

import { agentTemplateRoutes } from './agent-templates.js';

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

describe('agentTemplateRoutes', () => {
  beforeEach(() => {
    insertValues.mockReset();
    selectGet.mockReset();
  });

  it('lists >=8 templates without secret fields', async () => {
    const { app, routes } = makeApp();
    await agentTemplateRoutes(app);
    const list = await routes['GET /api/agent-templates']({});
    expect(Array.isArray(list)).toBe(true);
    expect((list as unknown[]).length).toBeGreaterThanOrEqual(8);
    for (const t of list as Record<string, unknown>[]) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.instructions).toBeTruthy();
      expect(Object.keys(t).join(',')).not.toMatch(/secret|password|apiKey|token/i);
    }
    expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it('returns 404 for unknown template', async () => {
    const { app, routes } = makeApp();
    await agentTemplateRoutes(app);
    const reply = replyMock();
    await routes['GET /api/agent-templates/:id'](
      { params: { id: 'nope' } },
      reply,
    );
    expect(reply.statusCode).toBe(404);
  });

  it('creates agent from template with overrides and persists allowedPaths', async () => {
    const tpl = getAgentTemplate('fullstack')!;
    expect(tpl).toBeTruthy();

    selectGet
      .mockReturnValueOnce(null) // existing id check
      .mockReturnValueOnce({
        id: 'agt-from-tpl',
        name: '自定义全栈',
        runtime: tpl.runtime,
        model: null,
        thinkingLevel: null,
        category: tpl.category,
        concurrency: tpl.concurrency,
        instructions: tpl.instructions,
        allowedPaths: './packages',
        mcpServers: null,
        archivedAt: null,
        createdAt: Date.now(),
      });

    const { app, routes } = makeApp();
    await agentTemplateRoutes(app);
    const reply = replyMock();
    const result = await routes['POST /api/agent-templates/:id/create'](
      {
        params: { id: 'fullstack' },
        body: {
          id: 'agt-from-tpl',
          name: '自定义全栈',
          allowedPaths: './packages',
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(insertValues).toHaveBeenCalled();
    const vals = insertValues.mock.calls[0][0] as {
      id: string;
      name: string;
      allowedPaths: string | null;
      instructions: string;
    };
    expect(vals.id).toBe('agt-from-tpl');
    expect(vals.name).toBe('自定义全栈');
    expect(vals.allowedPaths).toBe('./packages');
    expect(vals.instructions).toContain('全栈');

    const body = result as { id: string; name: string; allowedPaths: string | null };
    expect(body.id).toBe('agt-from-tpl');
    expect(body.name).toBe('自定义全栈');
    expect(body.allowedPaths).toBe('./packages');
  });
});

/**
 * e2e 骨架（手动 / 后续 inject）：
 * 1. GET http://localhost:3001/api/agent-templates → 200, length >= 8
 * 2. POST /api/agent-templates/fullstack/create { "name": "演示全栈" } → 201
 * 3. GET /api/agents/:id → instructions 非空，无 secret 字段
 */
