/**
 * Grok ACP backend 契约测试（M2/M3；mock ACP server 测试网，不依赖真机）。
 * 覆盖协议状态机：initialize → authenticate → session/new|load → set_model →
 * session/prompt → 事件归一化（message/thinking/tool）→ usage 落库 →
 * resume 续跑 / 失败诚实（auth 引导、会话丢失、provider error 提升、abort、timeout）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionInput, AgentEvent } from './types.js';
import { GrokBackend } from './grok.js';
import {
  createFakeAcpChild,
  MockAcpServer,
  type FakeAcpChild,
} from './mock-acp-server.js';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  resolveCmd: vi.fn(),
  versionOf: vi.fn(),
  killProcessTree: vi.fn(),
  trackChildPid: vi.fn(),
  untrackChildPid: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('./detect-path.js', () => ({
  resolveCmd: mocks.resolveCmd,
  versionOf: mocks.versionOf,
}));

vi.mock('./process-tree.js', () => ({
  killProcessTree: mocks.killProcessTree,
  trackChildPid: mocks.trackChildPid,
  untrackChildPid: mocks.untrackChildPid,
}));

import type { MockAcpServerOptions } from './mock-acp-server.js';

const backend = new GrokBackend();

function baseInput(over: Partial<ExecutionInput> = {}): ExecutionInput {
  return {
    prompt: 'hello grok',
    cwd: 'D:\\test',
    issueId: null,
    agentId: 'agt-grok',
    runId: 'run-grok-1',
    timeoutMs: 15_000,
    ...over,
  };
}

/** 建立 backend.execute ↔ mock ACP server 联通（spawn 注入 fake child） */
function setup(serverOpts?: MockAcpServerOptions) {
  const fake = createFakeAcpChild(4242);
  mocks.resolveCmd.mockResolvedValue('C:\\grok\\grok.exe');
  mocks.versionOf.mockResolvedValue('0.2.118');
  mocks.spawn.mockReturnValue(fake.child);
  // kill 进程树 → fake child 立即 close（模拟真实 kill 语义，close() 不再等 2s 宽限）
  mocks.killProcessTree.mockImplementation(() => {
    fake.child.emit('close');
  });
  const server = new MockAcpServer(fake, {
    authMethods: ['cached_token', 'grok.com'],
    ...serverOpts,
  });
  return { fake, server };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** autoRespond:false 手动驱动：应答 initialize/auth/session/new，prompt 挂起不答 */
async function driveToPendingPrompt(server: MockAcpServer): Promise<void> {
  await server.waitForRequest('initialize');
  server.respondTo(server.requestsOf('initialize').at(-1)!.id, {
    protocolVersion: 1,
    authMethods: [{ id: 'cached_token' }, { id: 'grok.com' }],
  });
  await server.waitForRequest('authenticate');
  server.respondTo(server.requestsOf('authenticate').at(-1)!.id, {});
  await server.waitForRequest('session/new');
  server.respondTo(server.requestsOf('session/new').at(-1)!.id, {
    sessionId: 'sess-hang',
    models: { currentModelId: 'grok-4.5' },
  });
  await server.waitForRequest('session/prompt'); // 保持挂起
}

/** 完整 happy 回合（初始化/认证/会话/流式事件/prompt 响应），返回 result + events */
async function runHappyTurn(
  server: MockAcpServer,
  fake: FakeAcpChild,
  input: ExecutionInput,
  opts: {
    streamUpdates?: boolean;
    usage?: Record<string, unknown>;
  } = {},
): Promise<{ result: Awaited<ReturnType<typeof backend.execute>>; events: AgentEvent[] }> {
  const events: AgentEvent[] = [];
  if (opts.usage) {
    // 覆盖 prompt 响应 usage（默认 mock 用小值）
    server.setPromptResult({
      stopReason: 'end_turn',
      _meta: { modelId: 'grok-4.5', usage: opts.usage },
    });
  }
  const p = backend.execute(input, (e) => events.push(e), new AbortController().signal);
  await server.waitForRequest('initialize');
  await server.waitForRequest('authenticate');
  await server.waitForRequest('session/new');

  if (opts.streamUpdates) {
    const promptParams = await server.waitForRequest('session/prompt');
    void promptParams;
    // 流式事件（gate 已开）：
    server.feedUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '思考中…' } });
    server.feedUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Let me check the logs' } });
    server.feedUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'Read file',
      kind: 'read',
      rawInput: { path: 'a.txt' },
    });
    server.feedUpdate({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', rawOutput: 'file content' });
    server.feedUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done. Result: OK' } });
  }

  const result = await p;
  void fake;
  return { result, events };
}

describe('GrokBackend 能力声明', () => {
  it('supportsSessionResume=true（ACP session/load 续跑为真）', () => {
    expect(backend.supportsSessionResume).toBe(true);
  });

  it('sendRunCommand 诚实不支持（ACP v1 无 steer 等方法）', async () => {
    const r = await backend.sendRunCommand('run-1', { command: 'steer', message: 'go on' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/不支持 steer/);
    const c = await backend.sendRunCommand('run-1', { command: 'compact' });
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/不支持 compact/);
  });
});

describe('GrokBackend execute：happy path（ACP 全状态机）', () => {
  it('initialize → authenticate(cached_token) → session/new → prompt 流式事件 → usage/会话落库', async () => {
    const { server, fake } = setup();
    const { result, events } = await runHappyTurn(server, fake, baseInput(), {
      streamUpdates: true,
      usage: {
        inputTokens: 19018,
        outputTokens: 256,
        totalTokens: 19274,
        cachedReadTokens: 8192,
        cacheCreationTokens: 0,
        costUsdTicks: 256456000,
        modelUsage: {},
      },
    });

    // 请求序列 = 协议状态机顺序
    expect(server.requests.map((r) => r.method)).toEqual([
      'initialize',
      'authenticate',
      'session/new',
      'session/prompt',
    ]);
    // authenticate 用本机 cached_token（密钥不落库）
    const auth = server.requestsOf('authenticate')[0]!.params as Record<string, unknown>;
    expect(auth.methodId).toBe('cached_token');

    // 事件归一化：thinking→log、message→assistant、tool 成对
    expect(events).toEqual([
      { type: 'log', text: '[grok] starting ACP stdio session…' },
      { type: 'log', text: '[grok] ACP authenticated (cached_token)' },
      { type: 'log', text: expect.stringContaining('[grok] session created') },
      { type: 'log', text: '思考中…' },
      { type: 'message', role: 'assistant', text: 'Let me check the logs' },
      { type: 'tool_start', name: 'read_file', args: { path: 'a.txt' } },
      { type: 'tool_end', name: 'read_file', result: 'file content' },
      { type: 'message', role: 'assistant', text: 'Done. Result: OK' },
    ]);

    // deliverable = 最后一次工具调用后的文本
    expect(result.finalText).toBe('Done. Result: OK');
    expect(result.exitReason).toBe('completed');
    // usage：实测形态 cached 剥离（input 19018-8192）
    expect(result.usage).toEqual({ input: 10826, output: 256, cacheRead: 8192, cacheWrite: 0 });
    // 会话 id 持久化 → 后续 resume 用
    expect(result.providerSessionId).toBe('sess-new-001');
  });

  it('无流式事件（无工具调用）→ finalText = 全文本', async () => {
    const { server, fake } = setup();
    const { result } = await runHappyTurn(server, fake, baseInput());
    expect(result.finalText).toBe('');
    expect(result.exitReason).toBe('completed');
  });

  it('agent.mcpServers → session/new 携带 ACP array shape（stdio + 远程按能力过滤）', async () => {
    const { server, fake } = setup();
    const { events } = await runHappyTurn(
      server,
      fake,
      baseInput({
        mcpServers: JSON.stringify({
          mcpServers: {
            fs: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
            },
            web: {
              type: 'http',
              url: 'https://mcp.example.com',
              headers: { Authorization: 'Bearer x' },
            },
          },
        }),
      }),
    );

    const sessionNew = server.requestsOf('session/new')[0]!.params as {
      mcpServers?: unknown;
    };
    expect(sessionNew.mcpServers).toEqual([
      {
        name: 'fs',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        env: [],
      },
      {
        name: 'web',
        url: 'https://mcp.example.com',
        headers: [{ name: 'Authorization', value: 'Bearer x' }],
      },
    ]);
    expect(events).toContainEqual({
      type: 'log',
      text: '[grok] 注入 2 个 MCP server（ACP session/new）',
    });
  });

  it('malformed mcpServers → 诚实 fail（fail closed，不静默丢 MCP）', async () => {
    const { server, fake } = setup();
    const events: AgentEvent[] = [];
    const p = backend.execute(
      baseInput({ mcpServers: '{bad json' }),
      (e) => events.push(e),
      new AbortController().signal,
    );
    await server.waitForRequest('initialize');
    const result = await p;
    expect(result.exitReason).toBe('failed');
    expect(result.error).toContain('MCP 配置解析失败');
  });

  it('initialize 未声明远程 transport → 远程条目过滤（stdio 保留），warn 日志', async () => {
    const { server, fake } = setup({
      onInitialize: () => ({
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          mcpCapabilities: { http: false, sse: false },
        },
        authMethods: [{ id: 'cached_token', name: 'cached_token' }],
        _meta: { modelState: { currentModelId: 'grok-4.5' } },
      }),
    });
    const { events } = await runHappyTurn(
      server,
      fake,
      baseInput({
        mcpServers: JSON.stringify({
          mcpServers: {
            fs: { command: 'npx', args: ['-y', 'some-mcp'] },
            web: { type: 'http', url: 'https://mcp.example.com' },
          },
        }),
      }),
    );

    const sessionNew = server.requestsOf('session/new')[0]!.params as {
      mcpServers?: unknown;
    };
    expect(sessionNew.mcpServers).toEqual([
      { name: 'fs', command: 'npx', args: ['-y', 'some-mcp'], env: [] },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'log', text: expect.stringContaining('已跳过') }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'log', text: expect.stringContaining('注入 1 个') }),
    );
  });
});

describe('GrokBackend execute：resume 续跑（M3）', () => {
  it('resumeSessionId → session/load（_meta.sessionId 兜底）→ prompt 引用上轮', async () => {
    const { server } = setup();
    const events: AgentEvent[] = [];
    const p = backend.execute(
      baseInput({ resumeSessionId: 'sess-old-123' }),
      (e) => events.push(e),
      new AbortController().signal,
    );
    await server.waitForRequest('initialize');
    await server.waitForRequest('authenticate');
    const loadParams = (await server.waitForRequest('session/load')) as Record<string, unknown>;
    expect(loadParams.sessionId).toBe('sess-old-123');
    // 不应发 session/new
    expect(server.requestsOf('session/new')).toHaveLength(0);
    const result = await p;
    expect(result.providerSessionId).toBe('sess-old-123');
    expect(result.exitReason).toBe('completed');
  });

  it('resume 会话丢失（prompt 报 Session not found）→ 清 id（worker 记 resume_miss）+ 诚实错误', async () => {
    const { server } = setup({
      errorResponses: {
        'session/prompt': { code: -32603, message: 'Internal error', data: 'Session not found' },
      },
    });
    const events: AgentEvent[] = [];
    const result = await backend.execute(
      baseInput({ resumeSessionId: 'sess-dead' }),
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/无法恢复会话 sess-dead/);
    // 死 id 不落库 → 下次 fresh
    expect(result.providerSessionId).toBeNull();
  });
});

describe('GrokBackend execute：失败诚实', () => {
  it('未登录（无 cached_token 提供）→ 分类失败 + grok login 引导', async () => {
    const { server } = setup({ authMethods: ['grok.com'] }); // 仅交互式
    const events: AgentEvent[] = [];
    const result = await backend.execute(baseInput(), (e) => events.push(e), new AbortController().signal);
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/认证失败/);
    expect(result.error).toMatch(/grok login/);
    // 未到 session 阶段
    expect(server.requestsOf('session/new')).toHaveLength(0);
  });

  it('authMethods 为空 → 同样引导', async () => {
    const { server } = setup({ authMethods: [] });
    const events: AgentEvent[] = [];
    const result = await backend.execute(baseInput(), (e) => events.push(e), new AbortController().signal);
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/grok login/);
    void server;
  });

  it('authenticate 失败 → 分类认证错误 + 引导', async () => {
    const { server } = setup({
      errorResponses: { authenticate: { code: -32603, message: 'auth failed' } },
    });
    const events: AgentEvent[] = [];
    const result = await backend.execute(baseInput(), (e) => events.push(e), new AbortController().signal);
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/认证失败/);
    expect(result.error).toMatch(/grok login/);
    void server;
  });

  it('通用失败（initialize 异常）→ stderr 嗅探线索并入错误文案（可诊断）', async () => {
    const { server, fake } = setup({
      errorResponses: { initialize: { code: -32603, message: 'internal error' } },
    });
    const events: AgentEvent[] = [];
    const p = backend.execute(baseInput(), (e) => events.push(e), new AbortController().signal);
    await server.waitForRequest('initialize');
    fake.stderr.emit('data', 'ERROR Settings fetch failed max_attempts=3\n');
    const result = await p;
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/Settings fetch failed/);
    void server;
  });

  it('stderr 终端 429 → completed 提升 failed（不误判瞬时警告）', async () => {
    const { server, fake } = setup();
    const events: AgentEvent[] = [];
    const p = backend.execute(baseInput(), (e) => events.push(e), new AbortController().signal);
    await server.waitForRequest('session/new');
    // 流式一帧后给 stderr 终端失败（drain 窗口内到达）
    const promptParams = await server.waitForRequest('session/prompt');
    void promptParams;
    server.feedUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'partial' } });
    fake.stderr.emit('data', 'error: HTTP 429 rate limit exceeded, giving up\n');
    const result = await p;
    expect(result.exitReason).toBe('failed');
    expect(result.error).toContain('429');
  });

  it('set_model 失败 → 诚实 fail（不静默降级模型）', async () => {
    const { server } = setup({
      errorResponses: { 'session/set_model': { code: -32603, message: 'model not available' } },
    });
    const events: AgentEvent[] = [];
    const result = await backend.execute(
      baseInput({ model: 'grok-3' }),
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/无法切换到模型 grok-3/);
    void server;
  });

  it('会话已在该模型 → 跳过 set_model', async () => {
    const { server } = setup();
    const events: AgentEvent[] = [];
    const p = backend.execute(baseInput({ model: 'grok-4.5' }), (e) => events.push(e), new AbortController().signal);
    await server.waitForRequest('session/new');
    await new Promise((r) => setTimeout(r, 100));
    expect(server.requestsOf('session/set_model')).toHaveLength(0);
    const result = await p;
    expect(result.exitReason).toBe('completed');
  });
});

describe('GrokBackend execute：abort / timeout', () => {
  it('signal abort 进行中（prompt 挂起）→ cancelled（不误判 failed）', async () => {
    const { server } = setup({ autoRespond: false });
    const ac = new AbortController();
    const events: AgentEvent[] = [];
    const p = backend.execute(baseInput(), (e) => events.push(e), ac.signal);
    await driveToPendingPrompt(server);
    ac.abort();
    const result = await p;
    expect(result.exitReason).toBe('cancelled');
    expect(mocks.killProcessTree).toHaveBeenCalledWith(4242);
  });

  it('timeoutMs 硬超时（prompt 挂起）→ failed timeout 错误（对齐 spawnLineProcess 语义）', async () => {
    const { server } = setup({ autoRespond: false });
    const events: AgentEvent[] = [];
    const p = backend.execute(
      baseInput({ timeoutMs: 100 }),
      (e) => events.push(e),
      new AbortController().signal,
    );
    await driveToPendingPrompt(server);
    const result = await p;
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/timeout: grok ACP exceeded 100ms/);
  });
});

describe('GrokBackend execute：agent→client request 自动应答（headless）', () => {
  it('回合中 permission 请求被自动授权，回合继续完成', async () => {
    const { server } = setup();
    const events: AgentEvent[] = [];
    const p = backend.execute(baseInput(), (e) => events.push(e), new AbortController().signal);
    await server.waitForRequest('initialize');
    await server.waitForRequest('authenticate');
    await server.waitForRequest('session/new');
    const promptParams = await server.waitForRequest('session/prompt');
    void promptParams;
    server.feedAgentRequest('session/request_permission', {
      sessionId: 's',
      requestId: 'r1',
      options: [{ optionId: 'allow_once', kind: 'allow_once' }],
    });
    server.feedUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'final answer' } });
    const result = await p;
    expect(result.exitReason).toBe('completed');
    expect(result.finalText).toBe('final answer');
  });
});

describe('GrokBackend detect / spawn 形态', () => {
  it('未安装 → 诚实失败', async () => {
    mocks.resolveCmd.mockResolvedValue(null);
    const result = await backend.execute(baseInput(), () => {}, new AbortController().signal);
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/未安装/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('spawn 参数 = ACP argv + cwd + env 合并', async () => {
    const { server, fake } = setup();
    const events: AgentEvent[] = [];
    await backend.execute(baseInput(), (e) => events.push(e), new AbortController().signal);
    expect(mocks.spawn).toHaveBeenCalledWith(
      'C:\\grok\\grok.exe',
      ['--no-auto-update', 'agent', '--always-approve', 'stdio'],
      expect.objectContaining({ cwd: 'D:\\test' }),
    );
    void server;
    void fake;
  });
});
