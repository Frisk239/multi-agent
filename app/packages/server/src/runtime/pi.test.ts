import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ExecutionInput, AgentEvent, RuntimeBackend } from './types.js';

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

import { PiBackend, PI_NOT_INSTALLED_ERROR } from './pi.js';

const baseInput: ExecutionInput = {
  prompt: 'hello',
  cwd: '/tmp',
  issueId: null,
  agentId: 'agt-pi',
  runId: 'run-pi',
};

/** 可控 EventEmitter 假子进程：stdin/stdout/stderr + close 事件 */
function makeFakeChild() {
  const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const stdin = { write: vi.fn(() => true), end: vi.fn(), on: vi.fn() };
  const child: any = Object.assign(new EventEmitter(), {
    pid: 4242,
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
  });
  return {
    child,
    /** 逐行吐 JSON 帧（自动补 \n） */
    feedJson(lines: unknown[]) {
      for (const l of lines) stdout.emit('data', JSON.stringify(l) + '\n');
    },
    /** 按原始 chunk 吐（模拟跨行/粘包切分） */
    feedChunks(chunks: string[]) {
      for (const c of chunks) stdout.emit('data', c);
    },
    close(code: number | null = 0) {
      child.emit('close', code);
    },
  };
}

/** 等 execute 的 spawn 与监听器注册完成（detect → spawn 链都是微任务） */
const tick = () => new Promise<void>((r) => setImmediate(r));

function setupInstalled() {
  mocks.resolveCmd.mockResolvedValue('/usr/bin/pi');
  mocks.versionOf.mockResolvedValue('pi 0.1.0');
  const f = makeFakeChild();
  mocks.spawn.mockReturnValue(f.child);
  return f;
}

describe('PiBackend (real pi RPC backend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declares real execution + session resume', () => {
    const backend = new PiBackend();
    expect(backend.executionImplemented).toBe(true);
    expect(backend.supportsSessionResume).toBe(true);
    expect((backend as RuntimeBackend).supportsThinkingLevel).not.toBe(true);
    expect(backend.id).toBe('pi');
  });

  it('detect reflects PATH via resolveCmd', async () => {
    mocks.resolveCmd.mockResolvedValue('/usr/bin/pi');
    mocks.versionOf.mockResolvedValue('pi 0.1.0');
    const det = await new PiBackend().detect();
    expect(det).toEqual({
      installed: true,
      path: '/usr/bin/pi',
      version: 'pi 0.1.0',
    });
    expect(mocks.resolveCmd).toHaveBeenCalledWith('PI_PATH', ['pi']);
  });

  it('execute fails when not installed', async () => {
    mocks.resolveCmd.mockResolvedValue(null);
    const events: unknown[] = [];
    const result = await new PiBackend().execute(
      baseInput,
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(result.exitReason).toBe('failed');
    expect(result.error).toBe(PI_NOT_INSTALLED_ERROR);
    expect(result.finalText).toBe('');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('reports the spawned PID to G8 ownership persistence', async () => {
    const f = setupInstalled();
    const onProcessStarted = vi.fn();
    const promise = new PiBackend().execute(
      { ...baseInput, onProcessStarted },
      () => {},
      new AbortController().signal,
    );
    await tick();
    expect(onProcessStarted).toHaveBeenCalledWith(4242);
    f.close(1);
    await promise;
  });

  // ---- 场景 1：happy path ----
  it('scenario 1: happy path — prompt preflight → agent events → agent_end completes', async () => {
    const f = setupInstalled();
    const events: AgentEvent[] = [];
    const promise = new PiBackend().execute(baseInput, (e) => events.push(e), new AbortController().signal);
    await tick();

    f.feedJson([
      { type: 'response', id: 'ma-gs', command: 'get_state', success: true, data: { sessionId: 'ses_pi_1' } },
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_start' },
      { type: 'message_start', message: { role: 'user', content: 'hello' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hel' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'lo!' } },
      { type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'bash', args: { command: 'pwd' } },
      { type: 'tool_execution_end', toolCallId: 'call-1', toolName: 'bash', result: '/tmp\n', isError: false },
      {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello!' },
            { type: 'thinking', text: 'skip me' },
          ],
          usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 2 },
        },
      },
      { type: 'turn_end', turnIndex: 0 },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);

    const result = await promise;
    expect(result.exitReason).toBe('completed');
    expect(result.finalText).toBe('Hello!');
    expect(result.usage).toEqual({ input: 100, output: 20, cacheRead: 5, cacheWrite: 2 });
    expect(result.providerSessionId).toBe('ses_pi_1');

    // 事件映射：message_delta ×2 / assistant message / user 回显 / tool_start / tool_end / log
    expect(events.filter((e) => e.type === 'message_delta').map((e) => e.text)).toEqual(['Hel', 'lo!']);
    expect(events.some((e) => e.type === 'message' && e.role === 'assistant' && e.text === 'Hello!')).toBe(true);
    expect(events.some((e) => e.type === 'message' && e.role === 'user' && e.text === 'hello')).toBe(true);
    expect(events.some((e) => e.type === 'tool_start' && e.name === 'bash')).toBe(true);
    expect(
      events.some((e) => e.type === 'tool_end' && e.name === 'bash' && String(e.result).includes('/tmp')),
    ).toBe(true);
    expect(events.some((e) => e.type === 'log')).toBe(true);

    // stdin 收到 get_state + prompt JSON；完成时 stdin.end() 被调
    const writes = f.child.stdin.write.mock.calls.map((c: unknown[]) => c[0] as string);
    const parsed = writes.map((w: string) => JSON.parse(w));
    expect(parsed.some((c: any) => c.type === 'get_state')).toBe(true);
    expect(parsed.some((c: any) => c.type === 'prompt' && c.message === 'hello')).toBe(true);
    expect(f.child.stdin.end).toHaveBeenCalledTimes(1);

    // spawn 参数：--mode rpc，cwd=input.cwd
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/usr/bin/pi',
      ['--mode', 'rpc'],
      expect.objectContaining({ cwd: '/tmp' }),
    );
  });

  // ---- 场景 2：分块/跨行帧 ----
  it('scenario 2: split frames, CRLF and dirty lines do not lose events or crash', async () => {
    const f = setupInstalled();
    const events: AgentEvent[] = [];
    const promise = new PiBackend().execute(baseInput, (e) => events.push(e), new AbortController().signal);
    await tick();

    f.feedChunks([
      '{"type":"response","id":"ma-gs","command":"get_state","success":true,"data":{"sessionId":"ses_x"}}\n',
      '{"type":"response","id":"ma-prompt","command":"prompt","success":true}\n{"type":"agen',
      't_start"}\n',
      '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"he"}}\r\n',
      'not json at all\n',
      '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}\n',
      '{"type":"agent_end","willRetry":false}\n',
    ]);
    f.close(0);

    const result = await promise;
    expect(result.exitReason).toBe('completed');
    expect(result.finalText).toBe('hi');
    expect(result.providerSessionId).toBe('ses_x');
    expect(events.some((e) => e.type === 'message_delta' && e.text === 'he')).toBe(true);
    expect(events.some((e) => e.type === 'message' && e.role === 'assistant' && e.text === 'hi')).toBe(true);
    expect(events.some((e) => e.type === 'log' && e.text.includes('agent_start'))).toBe(true);
  });

  // ---- 场景 3：prompt preflight 失败 ----
  it('scenario 3: prompt preflight failure → failed with error passthrough', async () => {
    const f = setupInstalled();
    const promise = new PiBackend().execute(baseInput, () => {}, new AbortController().signal);
    await tick();

    f.feedJson([
      { type: 'response', id: 'ma-gs', command: 'get_state', success: true, data: { sessionId: 's' } },
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: false, error: 'model not configured' },
    ]);
    // 真实 pi preflight 失败后进程仍存活；此处先让响应微任务完成再模拟退出
    await tick();
    f.child.stderr.emit('data', 'fatal: no model\n');
    f.close(1);

    const result = await promise;
    expect(result.exitReason).toBe('failed');
    expect(result.error).toContain('model not configured');
  });

  // ---- 场景 4：abort ----
  it('scenario 4: abort → abort 命令 + killProcessTree 被调 + 解析为 cancelled', async () => {
    const f = setupInstalled();
    const controller = new AbortController();
    const promise = new PiBackend().execute(baseInput, () => {}, controller.signal);
    await tick();

    controller.abort();
    f.close(null);

    const result = await promise;
    expect(result.exitReason).toBe('cancelled');
    expect(mocks.killProcessTree).toHaveBeenCalledWith(4242);
    const writes = f.child.stdin.write.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(writes.some((w: string) => JSON.parse(w).type === 'abort')).toBe(true);
  });

  // ---- 场景 5：resume ----
  it('thinkingLevel is ignored: spawn argv has no --effort/--variant', async () => {
    const f = setupInstalled();
    const promise = new PiBackend().execute(
      { ...baseInput, thinkingLevel: 'high' },
      () => {},
      new AbortController().signal,
    );
    await tick();

    expect(mocks.spawn).toHaveBeenCalledWith(
      '/usr/bin/pi',
      ['--mode', 'rpc'],
      expect.objectContaining({ cwd: '/tmp' }),
    );
    const argv = mocks.spawn.mock.calls[0]?.[1] as string[];
    expect(argv).not.toContain('--effort');
    expect(argv).not.toContain('--variant');
    expect(argv).not.toContain('high');

    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);
    await promise;
  });

  it('scenario 5: resumeSessionId → spawn args 含 --session-id', async () => {
    const backend = new PiBackend();
    expect(backend.supportsSessionResume).toBe(true);
    const f = setupInstalled();
    const promise = backend.execute(
      { ...baseInput, resumeSessionId: 'sess-abc' },
      () => {},
      new AbortController().signal,
    );
    await tick();

    expect(mocks.spawn).toHaveBeenCalledWith(
      '/usr/bin/pi',
      ['--mode', 'rpc', '--session-id', 'sess-abc'],
      expect.objectContaining({ cwd: '/tmp' }),
    );

    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);
    const result = await promise;
    expect(result.exitReason).toBe('completed');
  });

  // ---- 场景 6：启动即退 ----
  it('scenario 6: spawn 后无输出直接 close(code=1) → failed 带 stderr，绝不挂起', async () => {
    const f = setupInstalled();
    const promise = new PiBackend().execute(baseInput, () => {}, new AbortController().signal);
    await tick();

    f.child.stderr.emit('data', 'no API key configured\n');
    f.close(1);

    const result = await promise;
    expect(result.exitReason).toBe('failed');
    expect(result.error).toContain('no API key configured');
  });

  // ---- 补充：willRetry=true 不是完成点 ----
  it('agent_end willRetry=true 不完成，继续等下一个 agent_end', async () => {
    const f = setupInstalled();
    const events: AgentEvent[] = [];
    const promise = new PiBackend().execute(baseInput, (e) => events.push(e), new AbortController().signal);
    await tick();

    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_end', messages: [], willRetry: true },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);

    const result = await promise;
    expect(result.exitReason).toBe('completed');
    expect(events.some((e) => e.type === 'log' && e.text.includes('willRetry=true'))).toBe(true);
    expect(f.child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('G6-6 extension_ui_request → 无人值守时立即 cancelled，避免 CLI 卡到 idle 超时', async () => {
    const f = setupInstalled();
    const events: AgentEvent[] = [];
    const promise = new PiBackend().execute(baseInput, (e) => events.push(e), new AbortController().signal);
    await tick();

    // CLI 中途请求宿主确认（confirm + select：均应收到取消响应）
    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'extension_ui_request', id: 'u1', method: 'confirm', title: 'run command?', message: 'bash pwd?' },
      { type: 'extension_ui_request', id: 'u2', method: 'select', title: 'pick', options: ['a', 'b'] },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);

    const result = await promise;
    expect(result.exitReason).toBe('completed');
    const uiLogs = events.filter(
      (e): e is AgentEvent & { text: string } =>
        e.type === 'log' && typeof (e as { text?: unknown }).text === 'string',
    );
    expect(uiLogs).toHaveLength(1); // 只提示一次（防刷屏）
    expect(uiLogs[0]!.text).toContain('confirm'); // 首个请求的 method
    expect(uiLogs[0]!.text).toContain('无人值守');
    expect(uiLogs[0]!.text).toContain('自动取消');
    const writes = f.child.stdin.write.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string));
    expect(writes).toContainEqual({ type: 'extension_ui_response', id: 'u1', cancelled: true });
    expect(writes).toContainEqual({ type: 'extension_ui_response', id: 'u2', cancelled: true });
  });

  // ---- 补充：prompt success response 不是完成信号；退出码不可当完成信号 ----
  it('prompt success 后 exit 0 但无 agent_end → failed（退出码不是完成信号）', async () => {
    const f = setupInstalled();
    const promise = new PiBackend().execute(baseInput, () => {}, new AbortController().signal);
    await tick();

    f.feedJson([{ type: 'response', id: 'ma-prompt', command: 'prompt', success: true }]);
    f.close(0);

    const result = await promise;
    expect(result.exitReason).toBe('failed');
    expect(result.error).toMatch(/退出码 0/);
  });

  // ---- G1-1：运行中 RPC 命令面（steer / compact / set_model） ----
  it('G1-1 steer：运行中发出 steer JSON，success 响应 → ok:true', async () => {
    const f = setupInstalled();
    const backend = new PiBackend();
    const promise = backend.execute(baseInput, () => {}, new AbortController().signal);
    await tick();

    const resP = backend.sendRunCommand('run-pi', { command: 'steer', message: '先检查测试目录' });
    await tick();
    const writes = f.child.stdin.write.mock.calls.map((c: unknown[]) => c[0] as string);
    const steer = writes.map((w: string) => JSON.parse(w)).find((c: any) => c.type === 'steer');
    expect(steer).toBeTruthy();
    expect(steer.message).toBe('先检查测试目录');
    expect(steer.id).toMatch(/^ma-steer-\d+$/);

    f.feedJson([{ type: 'response', id: steer.id, command: 'steer', success: true }]);
    await expect(resP).resolves.toEqual({ ok: true });

    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);
    await promise;
  });

  it('G1-1 compact：customInstructions 可选序列化', async () => {
    const f = setupInstalled();
    const backend = new PiBackend();
    const promise = backend.execute(baseInput, () => {}, new AbortController().signal);
    await tick();

    const resP = backend.sendRunCommand('run-pi', {
      command: 'compact',
      customInstructions: '压缩会话后继续',
    });
    await tick();
    const writes = f.child.stdin.write.mock.calls.map((c: unknown[]) => c[0] as string);
    const compact = writes.map((w: string) => JSON.parse(w)).find((c: any) => c.type === 'compact');
    expect(compact.customInstructions).toBe('压缩会话后继续');

    f.feedJson([{ type: 'response', id: compact.id, command: 'compact', success: true }]);
    await expect(resP).resolves.toEqual({ ok: true });

    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);
    await promise;
  });

  it('G1-1 set_model + 失败 passthrough（success:false → ok:false 带 error）', async () => {
    const f = setupInstalled();
    const backend = new PiBackend();
    const promise = backend.execute(baseInput, () => {}, new AbortController().signal);
    await tick();

    const resP = backend.sendRunCommand('run-pi', {
      command: 'set_model',
      provider: 'deepseek',
      modelId: 'deepseek-v4-pro',
    });
    await tick();
    const writes = f.child.stdin.write.mock.calls.map((c: unknown[]) => c[0] as string);
    const setModel = writes.map((w: string) => JSON.parse(w)).find((c: any) => c.type === 'set_model');
    expect(setModel.provider).toBe('deepseek');
    expect(setModel.modelId).toBe('deepseek-v4-pro');

    f.feedJson([
      { type: 'response', id: setModel.id, command: 'set_model', success: false, error: 'model locked' },
    ]);
    await expect(resP).resolves.toEqual({ ok: false, error: 'model locked' });

    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);
    await promise;
  });

  it('G1-1 sendRunCommand：run 未在活动表（未执行/已结束）→ ok:false 诚实错误', async () => {
    const backend = new PiBackend();
    const res = await backend.sendRunCommand('run-ghost', { command: 'steer', message: 'x' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('没有活动中的 pi 进程');
  });

  it('G1-1 sendRunCommand：run 结束后再发命令 → ok:false（active 槽已注销）', async () => {
    const f = setupInstalled();
    const backend = new PiBackend();
    const promise = backend.execute(baseInput, () => {}, new AbortController().signal);
    await tick();
    f.feedJson([
      { type: 'response', id: 'ma-prompt', command: 'prompt', success: true },
      { type: 'agent_end', messages: [], willRetry: false },
    ]);
    f.close(0);
    await promise;

    const res = await backend.sendRunCommand('run-pi', { command: 'steer', message: 'x' });
    expect(res.ok).toBe(false);
  });
});
