/**
 * Mock ACP server 测试网（M1 契约测试，不依赖真机）。
 *
 * 用法：vi.mock('node:child_process') 后，把 createFakeAcpChild() 的 child 注入
 * AcpTransport 的 spawnFn；MockAcpServer 接管 fake child 的 stdin.write（解析
 * 客户端 JSON-RPC 行并脚本化应答），通过 child.stdout.emit('data', …) 向传输层
 * 喂行。与真机同走「行分隔 JSON」线协议（research.md §3 钉死）。
 *
 * 与 pi.test.ts 的 makeFakeChild 同构（EventEmitter 假子进程），但 stdin.write
 * 同步回调，保证传输层 writeLine 的 promise 正常 settle。
 */
import { EventEmitter } from 'node:events';

export interface FakeAcpChild {
  child: Record<string, unknown> & EventEmitter;
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: (data: string, cb?: (err?: Error | null) => void) => boolean;
    end: () => void;
    on: (ev: string, cb: (...args: unknown[]) => void) => void;
  };
  /** 已写入 stdin 的原始行（客户端→服务器方向断言用） */
  writes: string[];
}

export function createFakeAcpChild(pid = 4242): FakeAcpChild {
  const stdout = Object.assign(new EventEmitter(), {
    setEncoding: () => {},
  });
  const stderr = Object.assign(new EventEmitter(), {
    setEncoding: () => {},
  });
  const writes: string[] = [];
  const stdin = {
    write(data: string, cb?: (err?: Error | null) => void) {
      writes.push(String(data));
      cb?.(null);
      return true;
    },
    end() {
      /* noop */
    },
    on() {
      /* noop */
    },
  };
  const child = Object.assign(new EventEmitter(), {
    pid,
    stdin,
    stdout,
    stderr,
    kill: (() => {}) as () => void,
  }) as unknown as FakeAcpChild['child'];
  return { child, stdout, stderr, stdin, writes };
}

type RequestHandler = (params: unknown) => unknown;

export interface MockAcpServerOptions {
  /** 默认无 auth（空 authMethods）；可脚本化 */
  authMethods?: string[];
  onInitialize?: RequestHandler;
  onAuthenticate?: RequestHandler;
  onSessionNew?: RequestHandler;
  onSessionLoad?: RequestHandler;
  onSetModel?: RequestHandler;
  onPrompt?: RequestHandler;
  /** 未匹配脚本的 method 默认应答（默认 {}） */
  onAny?: RequestHandler;
  /** false = 只记录请求不自动应答（乱序/错误帧场景由测试手动 respondTo） */
  autoRespond?: boolean;
  /** 指定 method 一律回错误帧（认证失败/会话丢失等失败路径测试） */
  errorResponses?: Record<string, { code: number; message: string; data?: string }>;
}

/**
 * ACP 服务器角色（stdin 读请求 / stdout 应答），脚本化 + 请求序列断言。
 */
export class MockAcpServer {
  readonly requests: Array<{ method: string; params: unknown; id: number }> = [];
  private waiters = new Map<
    string,
    Array<(params: unknown) => void>
  >();
  private pendingIds = new Map<number, string>();

  constructor(
    private readonly child: FakeAcpChild,
    private readonly opts: MockAcpServerOptions = {},
  ) {
    const origWrite = child.stdin.write;
    child.stdin.write = (data: string, cb?: (err?: Error | null) => void) => {
      cb?.(null);
      const text = String(data).trim();
      // 记录客户端→服务器帧（应答断言用），再喂服务器解析
      if (text) {
        child.writes.push(text + '\n');
        this.handleLine(text);
      }
      return true;
    };
    void origWrite;
  }

  private handleLine(line: string): void {
    let j: unknown;
    try {
      j = JSON.parse(line);
    } catch {
      return;
    }
    if (!j || typeof j !== 'object') return;
    const o = j as Record<string, unknown>;
    if (typeof o.method !== 'string') return;
    const method = o.method;
    const id = typeof o.id === 'number' ? o.id : -1;
    const params = o.params ?? {};
    this.requests.push({ method, params, id });
    if (id >= 0) this.pendingIds.set(id, method);

    // 通知 waitForRequest
    const ws = this.waiters.get(method);
    if (ws && ws.length > 0) {
      const w = ws.shift()!;
      w(params);
    }

    if (id < 0) return; // client→agent notification：无应答

    if (this.opts.autoRespond === false) return; // 手动应答模式

    // 失败路径：该 method 一律回错误帧
    const errSpec = this.opts.errorResponses?.[method];
    if (errSpec) {
      this.respondError(id, errSpec);
      return;
    }

    let result: unknown;
    switch (method) {
      case 'initialize':
        result =
          this.opts.onInitialize?.(params) ??
          this.defaultInitialize();
        break;
      case 'authenticate':
        result = this.opts.onAuthenticate?.(params) ?? {};
        break;
      case 'session/new':
        result =
          this.opts.onSessionNew?.(params) ??
          this.defaultSessionNew();
        break;
      case 'session/load':
        result =
          this.opts.onSessionLoad?.(params) ??
          this.defaultSessionLoad(params);
        break;
      case 'session/set_model':
        result = this.opts.onSetModel?.(params) ?? {};
        break;
      case 'session/prompt':
        result = this.opts.onPrompt?.(params) ?? this.defaultPrompt();
        break;
      default:
        result = this.opts.onAny?.(params) ?? {};
    }
    this.respond(id, result);
  }

  private respond(id: number, result: unknown): void {
    this.child.stdout.emit(
      'data',
      JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n',
    );
  }

  private respondError(id: number, e: { code: number; message: string; data?: string }): void {
    this.child.stdout.emit(
      'data',
      JSON.stringify({ jsonrpc: '2.0', id, error: e }) + '\n',
    );
  }

  private defaultInitialize(): Record<string, unknown> {
    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: false, audio: false, embeddedContext: true },
        mcpCapabilities: { http: true, sse: true },
      },
      authMethods: (this.opts.authMethods ?? []).map((id) => ({ id, name: id })),
      _meta: {
        modelState: { currentModelId: 'grok-4.5', availableModels: [] },
        agentVersion: '0.2.118',
      },
    };
  }

  private defaultSessionNew(): Record<string, unknown> {
    return {
      sessionId: 'sess-new-001',
      models: { currentModelId: 'grok-4.5', availableModels: [] },
      _meta: { modelState: { currentModelId: 'grok-4.5' } },
    };
  }

  /** 与实测一致：session/load 顶层无 sessionId，_meta.sessionId 携带 */
  private defaultSessionLoad(params: unknown): Record<string, unknown> {
    const p = params as Record<string, unknown>;
    return {
      models: { currentModelId: 'grok-4.5', availableModels: [] },
      _meta: { sessionId: String(p.sessionId ?? '') },
    };
  }

  private defaultPrompt(): Record<string, unknown> {
    return {
      stopReason: 'end_turn',
      _meta: {
        modelId: 'grok-4.5',
        usage: {
          inputTokens: 1000,
          outputTokens: 50,
          totalTokens: 1050,
          cachedReadTokens: 0,
          cacheCreationTokens: 0,
          costUsdTicks: 12345,
          modelUsage: {},
        },
      },
    };
  }

  // ── 测试驱动 ──

  /** 服务器主动推 notification（走 stdout → 传输层） */
  feedNotification(method: string, params: unknown): void {
    this.child.stdout.emit(
      'data',
      JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n',
    );
  }

  /** 推 session/update 通知（update 对象原样） */
  feedUpdate(update: unknown, sessionId = 'sess-new-001'): void {
    this.feedNotification('session/update', { sessionId, update });
  }

  /** 服务器主动向客户端发 request（session/request_permission 等） */
  feedAgentRequest(method: string, params: unknown, id = 900): void {
    this.child.stdout.emit(
      'data',
      JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
    );
  }

  /** 手动应答指定 id（autoRespond:false 场景：乱序 / 错误帧） */
  respondTo(id: number, result: unknown, error?: { code: number; message: string; data?: string }): void {
    const frame = error
      ? { jsonrpc: '2.0', id, error }
      : { jsonrpc: '2.0', id, result };
    this.child.stdout.emit('data', JSON.stringify(frame) + '\n');
  }

  /** 覆盖 session/prompt 的应答结果（测试脚本化） */
  setPromptResult(result: unknown): void {
    this.opts.onPrompt = () => result;
  }

  /** 等客户端发来某 method 请求（返回其 params） */
  waitForRequest(method: string, timeoutMs = 2000): Promise<unknown> {
    const existing = this.requests.find((r) => r.method === method);
    if (existing) return Promise.resolve(existing.params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for request ${method}`)),
        timeoutMs,
      );
      const ws = this.waiters.get(method) ?? [];
      ws.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      this.waiters.set(method, ws);
    });
  }

  /** 按 method 取请求序列 */
  requestsOf(method: string): Array<{ params: unknown; id: number }> {
    return this.requests
      .filter((r) => r.method === method)
      .map(({ params, id }) => ({ params, id }));
  }
}
