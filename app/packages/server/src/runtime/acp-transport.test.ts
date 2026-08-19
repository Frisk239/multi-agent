/**
 * ACP 传输层契约测试（M1 测试网；不依赖真机）。
 * 覆盖：行分隔 JSON 帧 / request-response 关联（乱序）/ error 帧分类 /
 * session/update 归一化（三种序列化形态）/ permission 自动应答 /
 * 私有 notification 只报 method 名 / 进程退出中止 pending / close 语义 /
 * usage 解析（totalTokens 剥离缓存）/ 会话辅助提取 / deliverable tracker /
 * provider error sniffer。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpTransportCallbacks } from './acp-transport.js';
import {
  AcpTransport,
  AcpRpcError,
  isAcpSessionNotFound,
  normalizeAcpUpdate,
  parseAcpTokenUsage,
  parseAcpModelIdFromMeta,
  extractAcpSessionId,
  extractAcpAuthMethods,
  extractAcpCurrentModelId,
  resolveResumedSessionId,
  selectAcpPermissionOption,
  AcpDeliverableTracker,
  AcpProviderErrorSniffer,
} from './acp-transport.js';
import {
  createFakeAcpChild,
  MockAcpServer,
  type FakeAcpChild,
  type MockAcpServerOptions,
} from './mock-acp-server.js';

const mocks = vi.hoisted(() => ({
  killProcessTree: vi.fn(),
  trackChildPid: vi.fn(),
  untrackChildPid: vi.fn(),
}));

vi.mock('./process-tree.js', () => ({
  killProcessTree: mocks.killProcessTree,
  trackChildPid: mocks.trackChildPid,
  untrackChildPid: mocks.untrackChildPid,
}));

function makeTransport(fake: FakeAcpChild, callbacks?: AcpTransportCallbacks): AcpTransport {
  return new AcpTransport({
    bin: 'grok',
    args: ['--no-auto-update', 'agent', '--always-approve', 'stdio'],
    cwd: 'D:\\test',
    spawnFn: (() => fake.child) as never,
    callbacks,
  });
}

/** 建立 传输层 ↔ mock ACP 服务器 联通 */
function connect(serverOpts?: MockAcpServerOptions, callbacks?: AcpTransportCallbacks) {
  const fake = createFakeAcpChild();
  const server = new MockAcpServer(fake, serverOpts);
  const transport = makeTransport(fake, callbacks);
  return { fake, server, transport };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('行分隔 JSON 帧 + request/response 关联', () => {
  it('request → 应答按 id 关联；并发乱序应答不串线', async () => {
    const { server, transport } = connect({ autoRespond: false });
    const p1 = transport.request('session/new', { cwd: '.' });
    const p2 = transport.request('session/prompt', { sessionId: 's' });
    const p3 = transport.request('initialize', { protocolVersion: 1 });
    await server.waitForRequest('initialize');
    await server.waitForRequest('session/new');
    await server.waitForRequest('session/prompt');
    const ids = server.requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
    const idOf = (method: string) => server.requests.find((r) => r.method === method)!.id;
    // 按相反顺序应答（最后发起的先答）
    server.respondTo(idOf('session/prompt'), { stopReason: 'end_turn' });
    server.respondTo(idOf('session/new'), { sessionId: 'sess-9' });
    server.respondTo(idOf('initialize'), { protocolVersion: 1 });
    expect(await p3).toEqual({ protocolVersion: 1 });
    expect(await p2).toEqual({ stopReason: 'end_turn' });
    expect(await p1).toEqual({ sessionId: 'sess-9' });
    await transport.close();
  });

  it('error 帧 → AcpRpcError（code/message/data 结构化）', async () => {
    const { server, transport } = connect({ autoRespond: false });
    const p = transport.request('session/load', { sessionId: 'dead' });
    await server.waitForRequest('session/load');
    server.respondTo(server.requestsOf('session/load')[0]!.id, undefined, {
      code: -32602,
      message: 'Invalid params',
      data: 'missing field `sessionId`',
    });
    await expect(p).rejects.toMatchObject({
      name: 'AcpRpcError',
      code: -32602,
      data: 'missing field `sessionId`',
    });
    await transport.close();
  });

  it('进程退出 → 所有 pending reject + untrackChildPid', async () => {
    const { fake, transport } = connect({ autoRespond: false });
    const p = transport.request('session/prompt', {});
    await Promise.resolve();
    fake.child.emit('close');
    await expect(p).rejects.toThrow(/exited/);
    expect(mocks.untrackChildPid).toHaveBeenCalledWith(4242);
  });
});

describe('session/update 归一化', () => {
  it('sessionUpdate camelCase 形态', () => {
    const u = normalizeAcpUpdate({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'hi' },
    });
    expect(u.type).toBe('agent_message_chunk');
    expect(u.data.content).toEqual({ type: 'text', text: 'hi' });
  });

  it('type 形态', () => {
    const u = normalizeAcpUpdate({ type: 'tool_call', toolCallId: 't1' });
    expect(u.type).toBe('tool_call');
  });

  it('externally-tagged wrapper 形态', () => {
    const u = normalizeAcpUpdate({ turnEnd: { stopReason: 'end_turn' } });
    expect(u.type).toBe('turn_end');
  });

  it('未知类型 → 空 type（调用方忽略）', () => {
    expect(normalizeAcpUpdate({ sessionUpdate: 'mystery' }).type).toBe('');
    expect(normalizeAcpUpdate(null).type).toBe('');
  });

  it('通知分发走 onUpdate；私有通知只报 method 名', async () => {
    const seenOther: string[] = [];
    const updates: string[] = [];
    const { server, transport } = connect(undefined, {
      onUpdate: (u) => updates.push(u.type),
      onOtherNotification: (m) => seenOther.push(m),
    });
    server.feedNotification('_x.ai/mcp/servers_updated', {
      mcpServers: [{ env: [{ name: 'GITHUB_TOKEN', value: 'secret' }] }],
    });
    server.feedUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } });
    server.feedUpdate({ sessionUpdate: 'turn_end', stopReason: 'end_turn' });
    await new Promise((r) => setTimeout(r, 20));
    expect(seenOther).toEqual(['_x.ai/mcp/servers_updated']);
    expect(updates).toEqual(['agent_message_chunk', 'turn_end']);
    await transport.close();
  });
});

describe('session/request_permission 自动应答', () => {
  it('offer allow_once → 选中授权（回包走客户端→服务器线）', async () => {
    const { fake, server, transport } = connect();
    const p = transport.request('session/prompt', { sessionId: 's' });
    await server.waitForRequest('session/prompt');
    server.feedAgentRequest('session/request_permission', {
      sessionId: 's',
      requestId: 'r1',
      options: [
        { optionId: 'allow_once', kind: 'allow_once' },
        { optionId: 'deny', kind: 'reject_always' },
      ],
    });
    await new Promise((r) => setTimeout(r, 20));
    const resp = fake.writes
      .map((w) => JSON.parse(w) as Record<string, unknown>)
      .find((w) => w.id === 900);
    expect(resp).toBeDefined();
    expect((resp!.result as Record<string, unknown>).outcome).toEqual({
      outcome: 'selected',
      optionId: 'allow_once',
    });
    await transport.close();
    await p;
  });

  it('offer approve_for_session → 选中会话级授权', () => {
    const sel = selectAcpPermissionOption([
      { optionId: 'approve_for_session', kind: 'allow_always' },
    ]);
    expect(sel).toEqual({ optionId: 'approve_for_session', grant: true });
  });

  it('仅 reject_always → 无可选 → 协议错误（fail closed）', async () => {
    const { fake, server, transport } = connect();
    const p = transport.request('session/prompt', { sessionId: 's' });
    await server.waitForRequest('session/prompt');
    server.feedAgentRequest('session/request_permission', {
      options: [{ optionId: 'deny_always', kind: 'reject_always' }],
    });
    await new Promise((r) => setTimeout(r, 20));
    const resp = fake.writes
      .map((w) => JSON.parse(w) as Record<string, unknown>)
      .find((w) => w.id === 900);
    expect((resp!.error as Record<string, unknown>).code).toBe(-32603);
    await transport.close();
    await p;
  });

  it('未知 agent request → -32601', async () => {
    const { fake, server, transport } = connect();
    const p = transport.request('session/prompt', {});
    await server.waitForRequest('session/prompt');
    server.feedAgentRequest('_x.ai/some_request', {}, 901);
    await new Promise((r) => setTimeout(r, 20));
    const resp = fake.writes
      .map((w) => JSON.parse(w) as Record<string, unknown>)
      .find((w) => w.id === 901);
    expect((resp!.error as Record<string, unknown>).code).toBe(-32601);
    await transport.close();
    await p;
  });
});

describe('close 语义', () => {
  it('close → stdin EOF；未自退则 kill 进程树', async () => {
    const { fake, transport } = connect();
    const endSpy = vi.spyOn(fake.stdin, 'end');
    await transport.close();
    expect(endSpy).toHaveBeenCalled();
    expect(mocks.killProcessTree).toHaveBeenCalledWith(4242);
  });

  it('子进程自行退出（close 事件）→ close 快速返回不 kill', async () => {
    const { fake, transport } = connect();
    const p = transport.close();
    fake.child.emit('close');
    await p;
    expect(mocks.killProcessTree).not.toHaveBeenCalled();
  });
});

describe('isAcpSessionNotFound 分类', () => {
  it('-32603 + session not found → true', () => {
    const err = new AcpRpcError('session/prompt', -32603, 'Internal error', 'Session not found');
    expect(isAcpSessionNotFound(err)).toBe(true);
  });
  it('-32602 + data 含 no session found → true', () => {
    const err = new AcpRpcError('session/prompt', -32602, 'Invalid params', 'No session found with id x');
    expect(isAcpSessionNotFound(err)).toBe(true);
  });
  it('其他错误 → false', () => {
    expect(isAcpSessionNotFound(new AcpRpcError('a', -32603, 'boom', ''))).toBe(false);
    expect(isAcpSessionNotFound(new Error('nope'))).toBe(false);
  });
});

describe('usage 解析（对齐 multica excludeACPCachedInput）', () => {
  it('grok 实测形态：cached 在 input 内 + totalTokens 判定剥离', () => {
    const u = parseAcpTokenUsage({
      inputTokens: 19018,
      outputTokens: 256,
      totalTokens: 19274,
      cachedReadTokens: 8192,
      cacheCreationTokens: 0,
      costUsdTicks: 256456000,
      modelUsage: {},
    })!;
    expect(u).toEqual({ input: 10826, output: 256, cacheRead: 8192, cacheWrite: 0 });
  });
  it('total != input+output → 不剥离（代理报告互斥桶）', () => {
    const u = parseAcpTokenUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 160, cachedReadTokens: 10 })!;
    expect(u.input).toBe(100);
  });
  it('snake_case + cacheCreationTokens 别名', () => {
    const u = parseAcpTokenUsage({
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 3,
    })!;
    expect(u).toEqual({ input: 10, output: 5, cacheRead: 0, cacheWrite: 3 });
  });
  it('无任何 token 字段 → null', () => {
    expect(parseAcpTokenUsage({ costUsdTicks: 1 })).toBeNull();
    expect(parseAcpTokenUsage(null)).toBeNull();
  });
  it('parseAcpModelIdFromMeta', () => {
    expect(parseAcpModelIdFromMeta({ modelId: 'grok-4.5' })).toBe('grok-4.5');
    expect(parseAcpModelIdFromMeta({ model_id: 'grok-3' })).toBe('grok-3');
    expect(parseAcpModelIdFromMeta(null)).toBe('');
  });
});

describe('会话辅助提取', () => {
  it('extractAcpSessionId：顶层 + _meta 兜底（session/load 实测形态）', () => {
    expect(extractAcpSessionId({ sessionId: 'a' })).toBe('a');
    expect(extractAcpSessionId({ _meta: { sessionId: 'b' } })).toBe('b');
    expect(extractAcpSessionId({})).toBe('');
  });
  it('extractAcpAuthMethods', () => {
    expect(
      extractAcpAuthMethods({ authMethods: [{ id: 'cached_token' }, { id: 'grok.com' }] }),
    ).toEqual(['cached_token', 'grok.com']);
    expect(extractAcpAuthMethods({})).toEqual([]);
  });
  it('extractAcpCurrentModelId：models 嵌套 + 顶层', () => {
    expect(extractAcpCurrentModelId({ models: { currentModelId: 'grok-4.5' } })).toBe('grok-4.5');
    expect(extractAcpCurrentModelId({ current_model_id: 'grok-3' })).toBe('grok-3');
    expect(extractAcpCurrentModelId({})).toBe('');
  });
  it('resolveResumedSessionId：响应携带用响应值；无则回退请求 id', () => {
    expect(resolveResumedSessionId('req-1', { _meta: { sessionId: 'new-1' } })).toBe('new-1');
    expect(resolveResumedSessionId('req-1', {})).toBe('req-1');
  });
});

describe('deliverable tracker（最后一次 tool call 之后的文本）', () => {
  it('纯文本 → deliverable = 全文本', () => {
    const t = new AcpDeliverableTracker();
    t.observe('Let me check', false);
    t.observe(' the logs.', false);
    expect(t.result().deliverable).toBe('Let me check the logs.');
  });
  it('工具调用后 → deliverable 只留工具后文本；工具收尾 → 回退最近文本块', () => {
    const t = new AcpDeliverableTracker();
    t.observe('Let me check first', false);
    t.observe(null, true); // tool call
    t.observe('Done. Result: OK', false);
    expect(t.result().deliverable).toBe('Done. Result: OK');
    const t2 = new AcpDeliverableTracker();
    t2.observe('Narration', false);
    t2.observe(null, true);
    t2.observe(null, true); // 连续工具调用收尾
    expect(t2.result().deliverable).toBe('Narration');
  });
});

describe('provider error sniffer（stderr 终端失败分类）', () => {
  it('瞬时警告 → message 有值但 terminalMessage 为空', () => {
    const s = new AcpProviderErrorSniffer('grok');
    s.feed('WARNING: retrying request (attempt 1/3)\n');
    expect(s.terminalMessage()).toBe('');
  });
  it('429 rate limit → terminal', () => {
    const s = new AcpProviderErrorSniffer('grok');
    s.feed('error: HTTP 429 rate limit exceeded, giving up\n');
    expect(s.terminalMessage()).toContain('429');
  });
  it('未登录 → terminal（auth 分类）', () => {
    const s = new AcpProviderErrorSniffer('grok');
    s.feed('Error: not authenticated, please run grok login\n');
    expect(s.terminalMessage()).toContain('login');
  });
  it('非错误行忽略', () => {
    const s = new AcpProviderErrorSniffer('grok');
    s.feed('info: started\n');
    expect(s.message()).toBe('');
  });
});

describe('spawn 参数', () => {
  it('reports the spawned PID to G8 ownership persistence', () => {
    const fake = createFakeAcpChild(4242);
    const onProcessStarted = vi.fn();
    void new AcpTransport({
      bin: 'grok',
      args: ['agent', 'stdio'],
      cwd: 'D:\\x',
      spawnFn: (() => fake.child) as never,
      onProcessStarted,
    });
    expect(onProcessStarted).toHaveBeenCalledWith(4242);
  });

  it('spawn 带 cwd/windowsHide/env 合并', () => {
    const fake = createFakeAcpChild();
    const spy = vi.fn(() => fake.child);
    const t = new AcpTransport({
      bin: 'grok',
      args: ['a', 'b'],
      cwd: 'D:\\x',
      env: { FOO: 'bar' },
      spawnFn: spy as never,
    });
    expect(spy).toHaveBeenCalledWith(
      'grok',
      ['a', 'b'],
      expect.objectContaining({
        cwd: 'D:\\x',
        windowsHide: true,
        env: expect.objectContaining({ FOO: 'bar' }),
      }),
    );
    void t;
  });
});
