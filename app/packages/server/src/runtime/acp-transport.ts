/**
 * ACP（Agent Client Protocol）JSON-RPC 2.0 stdio 传输层。
 *
 * 蓝图：multica `server/pkg/agent/hermes.go`（hermesClient 传输 + 通知归一化 +
 * usage 解析 + permission 自动应答）+ `grok.go`（会话状态机），本文件只做
 * 「spawn → 行分隔 JSON 帧 → request/response 关联 → 通知分发」。
 *
 * 帧格式：**行分隔 JSON**（每帧一行、`\n` 结尾）——本机实测 grok 0.2.118 钉死
 * （非 Content-Length）。见 .scratch/grok-acp/research.md §3。
 *
 * 安全：notification payload 一律不进日志（grok 会推 `_x.ai/mcp/servers_updated`
 * 等私有通知，其中含本机 ~/.grok 配置的 MCP 凭据）——只允许上报 method 名。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { TokenUsage } from './types.js';
import { killProcessTree, trackChildPid, untrackChildPid } from './process-tree.js';

// ── 类型 ──

export interface AcpSessionUpdate {
  /** 归一化 update type：agent_message_chunk / agent_thought_chunk / tool_call /
   *  tool_call_update / usage_update / turn_end / user_message_chunk / … */
  type: string;
  data: Record<string, unknown>;
}

export interface AcpTransportCallbacks {
  /** session/update 归一化后分发（是否接受由调用方 gate，防历史回放） */
  onUpdate?: (update: AcpSessionUpdate) => void;
  /** 任意已接受的 session update 到达（quiescence drain 用） */
  onActivity?: () => void;
  /** stderr 原文（provider error sniffer 用） */
  onStderr?: (chunk: string) => void;
  /** 其他 notification 的 method 名——仅名字，不落 payload（防本机凭据泄露） */
  onOtherNotification?: (method: string) => void;
}

export interface AcpTransportOptions {
  bin: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  callbacks?: AcpTransportCallbacks;
  /** 测试注入 spawn（mock ACP server 测试网用） */
  spawnFn?: typeof spawn;
  /** abort → 拒绝所有 pending + kill 进程树（worker 取消/超时路径） */
  signal?: AbortSignal;
  /** G8-2：spawn 后将真实 PID 交给 orchestration 持久化身份。 */
  onProcessStarted?: (pid: number) => void;
}

/** JSON-RPC error 帧（结构化 code/message/data，可分类而非解析文本） */
export class AcpRpcError extends Error {
  readonly method: string;
  readonly code: number;
  readonly data: string;

  constructor(method: string, code: number, message: string, data: string) {
    super(data ? `${method}: ${message} (code=${code}, data=${data})` : `${method}: ${message} (code=${code})`);
    this.name = 'AcpRpcError';
    this.method = method;
    this.code = code;
    this.data = data;
  }
}

/**
 * 会话 id 被 agent 拒绝（resume 时 session 已丢失）。
 * runtimes 用 code + 措辞组合信号：-32603/-32602 + "session not found" /
 * "no session found"（对齐 multica hermes.go:1097 isACPSessionNotFound）。
 */
export function isAcpSessionNotFound(err: unknown): boolean {
  if (!(err instanceof AcpRpcError)) return false;
  if (err.code !== -32603 && err.code !== -32602) return false;
  const text = `${err.message} ${err.data}`.toLowerCase();
  return text.includes('session not found') || text.includes('no session found');
}

// ── session/request_permission 自动应答（headless）──

export interface AcpPermissionOption {
  optionId?: string;
  kind?: string;
}

/** ACP v1 PermissionOptionKind；仅 allow 类授杼；reject_once 仅拒单次动作 */
export function selectAcpPermissionOption(
  options: unknown,
): { optionId: string; grant: boolean } | null {
  if (!Array.isArray(options)) return null;
  const opts = options as AcpPermissionOption[];
  const norm = (s: unknown) =>
    typeof s === 'string' ? s.trim().toLowerCase() : '';

  // 1) 会话级授权 id（allow_session / approve_for_session，带 allow kind）
  for (const want of ['allow_session', 'approve_for_session']) {
    for (const o of opts) {
      if (o.optionId === want && (norm(o.kind) === 'allow_once' || norm(o.kind) === 'allow_always')) {
        return { optionId: want, grant: true };
      }
    }
  }
  // 2) 单次授权 allow_once（无论 optionId 为何）
  for (const o of opts) {
    if (o.optionId && norm(o.kind) === 'allow_once') {
      return { optionId: o.optionId, grant: true };
    }
  }
  // 3) 无安全授权 → 拒单次动作（不整体 cancel 回合）
  for (const o of opts) {
    if (o.optionId && norm(o.kind) === 'reject_once') {
      return { optionId: o.optionId, grant: false };
    }
  }
  return null;
}

// ── session/update 归一化 ──

/**
 * ACP SessionUpdate 有几种序列化形态（multica hermes.go:1328 normalizeACPUpdate）：
 * - {sessionUpdate: "agent_message_chunk", ...}
 * - {type: "agent_message_chunk", ...}
 * - externally-tagged：{agentMessageChunk: {...}}
 */
export function normalizeAcpUpdate(raw: unknown): AcpSessionUpdate {
  if (!raw || typeof raw !== 'object') return { type: '', data: {} };
  const o = raw as Record<string, unknown>;

  const key = (v: unknown) =>
    typeof v === 'string'
      ? v.toLowerCase().replace(/[_-]/g, '')
      : '';

  let t = key(o.sessionUpdate);
  let data = o;
  if (!t) t = key(o.type);
  if (!t && typeof o.sessionUpdate === 'string') t = key(o.sessionUpdate);

  if (!t) {
    // externally-tagged wrapper：单键对象
    const keys = Object.keys(o);
    if (keys.length === 1) {
      const v = o[keys[0]];
      if (v && typeof v === 'object') {
        t = key(keys[0]);
        data = v as Record<string, unknown>;
      }
    }
  }

  const map: Record<string, string> = {
    agentmessagechunk: 'agent_message_chunk',
    agentthoughtchunk: 'agent_thought_chunk',
    usermessagechunk: 'user_message_chunk',
    toolcall: 'tool_call',
    toolcallupdate: 'tool_call_update',
    usageupdate: 'usage_update',
    turnend: 'turn_end',
    endturn: 'turn_end',
  };
  return { type: map[t] ?? '', data };
}

// ── usage 解析（对齐 multica hermes.go:1765 parseACPTokenUsage + 1816 excludeACPCachedInput）──

const aliases: Record<string, string[]> = {
  input: ['inputTokens', 'input_tokens', 'input'],
  output: ['outputTokens', 'output_tokens', 'output'],
  cacheRead: [
    'cachedReadTokens', 'cached_read_tokens', 'cacheReadTokens', 'cache_read_tokens',
    'cacheReadInputTokens', 'cache_read_input_tokens',
  ],
  cacheWrite: [
    'cachedWriteTokens', 'cached_write_tokens', 'cacheWriteTokens', 'cache_write_tokens',
    'cacheCreationTokens', 'cache_creation_tokens', 'cache_creation_input_tokens',
  ],
};

function usageNum(o: Record<string, unknown>, names: string[]): number | null {
  for (const n of names) {
    const v = o[n];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
    if (typeof v === 'string' && v.trim() !== '') {
      const x = Number(v);
      if (Number.isFinite(x) && x >= 0) return Math.floor(x);
    }
  }
  return null;
}

/**
 * ACP usage 对象 → TokenUsage。实测 grok 0.2.118 报告
 * `{inputTokens, outputTokens, cachedReadTokens, cacheCreationTokens, totalTokens, costUsdTicks, modelUsage}`，
 * cached 计数**包含**在 inputTokens 内（total == input + output 证实）——
 * 与 multica 相同，须按 totalTokens 判定剥离，否则缓存前缀按全价多计。
 */
export function parseAcpTokenUsage(blob: unknown): TokenUsage | null {
  if (!blob || typeof blob !== 'object') return null;
  const o = blob as Record<string, unknown>;

  const input = usageNum(o, aliases.input);
  const output = usageNum(o, aliases.output);
  const cacheRead = usageNum(o, aliases.cacheRead);
  const cacheWrite = usageNum(o, aliases.cacheWrite);
  if (input == null && output == null && cacheRead == null && cacheWrite == null) {
    return null;
  }

  let usage: TokenUsage = {
    input: input ?? 0,
    output: output ?? 0,
    cacheRead: cacheRead ?? 0,
    cacheWrite: cacheWrite ?? 0,
  };

  // excludeACPCachedInput：totalTokens 存在且 == input + output → cached 在 input 内，剥离
  const total = usageNum(o, ['totalTokens', 'total_tokens']);
  if (
    total != null &&
    total > 0 &&
    (usage.cacheRead ?? 0) > 0 &&
    (usage.cacheRead ?? 0) <= (usage.input ?? 0) &&
    total === (usage.input ?? 0) + (usage.output ?? 0)
  ) {
    usage = { ...usage, input: (usage.input ?? 0) - (usage.cacheRead ?? 0) };
  }
  return usage;
}

/** `_meta` 里的 modelId（grok 每回合盖章 `_meta.modelId`；session/load 无顶层 model 时是唯一权威） */
export function parseAcpModelIdFromMeta(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return '';
  const m = meta as Record<string, unknown>;
  const id = typeof m.modelId === 'string' ? m.modelId.trim() : '';
  if (id) return id;
  return typeof m.model_id === 'string' ? m.model_id.trim() : '';
}

// ── 会话辅助（对齐 multica hermes.go:1856+，grok 实测补充 _meta 兜底）──

/** session/new|load 响应取 sessionId；grok session/load 顶层无 sessionId，_meta.sessionId 兜底（实测钉死） */
export function extractAcpSessionId(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as Record<string, unknown>;
  if (typeof r.sessionId === 'string' && r.sessionId.trim()) return r.sessionId.trim();
  const meta = r._meta;
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    if (typeof m.sessionId === 'string' && m.sessionId.trim()) return m.sessionId.trim();
  }
  return '';
}

/** initialize 响应 authMethods:[{id}] → id 列表（空 = 无需显式 auth） */
export function extractAcpAuthMethods(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  const list = r.authMethods;
  if (!Array.isArray(list)) return [];
  const ids: string[] = [];
  for (const m of list) {
    if (m && typeof m === 'object') {
      const id = (m as Record<string, unknown>).id;
      if (typeof id === 'string' && id.trim()) ids.push(id.trim());
    }
  }
  return ids;
}

/** session/new|load 响应当前模型（models.currentModelId / 顶层 / _meta.modelState 实测形态） */
export function extractAcpCurrentModelId(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as Record<string, unknown>;
  const models = r.models;
  if (models && typeof models === 'object') {
    const m = models as Record<string, unknown>;
    for (const k of ['currentModelId', 'current_model_id']) {
      if (typeof m[k] === 'string' && (m[k] as string).trim()) return (m[k] as string).trim();
    }
  }
  for (const k of ['currentModelId', 'current_model_id']) {
    if (typeof r[k] === 'string' && (r[k] as string).trim()) return (r[k] as string).trim();
  }
  // grok initialize 实测：_meta.modelState.currentModelId
  const meta = r._meta;
  if (meta && typeof meta === 'object') {
    const ms = (meta as Record<string, unknown>).modelState;
    if (ms && typeof ms === 'object') {
      const m = ms as Record<string, unknown>;
      for (const k of ['currentModelId', 'current_model_id']) {
        if (typeof m[k] === 'string' && (m[k] as string).trim()) return (m[k] as string).trim();
      }
    }
  }
  return '';
}

/** resume 后采纳的 session id：响应携带则用响应值（可能被 agent 换新），否则回退请求 id */
export function resolveResumedSessionId(requested: string, result: unknown): string {
  const got = extractAcpSessionId(result);
  return got || requested;
}

// ── deliverable tracker（对齐 multica acp_deliverable.go）──

/**
 * ACP 回合文本流拆「最终人读答复」与「全量记录」：narrate 与最终答案同为
 * agent_message_chunk，工具调用是唯一边界 → deliverable = 最后一次 tool call
 * 之后的文本；工具收尾回合无尾文本 → 回退最近一段文本块。
 */
export class AcpDeliverableTracker {
  private full = '';
  private deliverable = '';
  private lastTextBlock = '';

  /** text: agent_message_chunk 文本；toolUse: 出现 tool call（重置 deliverable） */
  observe(text: string | null, toolUse: boolean): void {
    if (text && text.length > 0) {
      this.full += text;
      this.deliverable += text;
    }
    if (toolUse) {
      if (this.deliverable.trim()) this.lastTextBlock = this.deliverable;
      this.deliverable = '';
    }
  }

  result(): { deliverable: string; full: string } {
    let d = this.deliverable;
    if (!d.trim()) d = this.lastTextBlock;
    return { deliverable: d, full: this.full };
  }
}

// ── provider error sniffer（对齐 multica hermes.go:2350+，grok 是 Go 二进制，stderr 为纯文本）──

const ACP_ERROR_LINE_RE = /\b(error|failed|failure|exception|invalid)\b/i;
const ACP_TERMINAL_RE =
  /401|403|429|unauthorized|not authenticated|authentication failed|login|rate\s*limit|quota|exceeded|insufficient|billing|credit|payment/i;

/**
 * stderr 嗅探：分类「终端失败」（auth / quota / rate-limit——agent 已放弃重试）
 * 与「瞬时重试警告」。只有 terminalMessage() 非空才允许 completed→failed 提升，
 * 避免把重试成功前的警告误判为失败。
 */
export class AcpProviderErrorSniffer {
  private readonly provider: string;
  private lines: string[] = [];
  private terminal = false;

  constructor(provider: string) {
    this.provider = provider;
  }

  feed(chunk: string): void {
    for (const raw of chunk.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || !ACP_ERROR_LINE_RE.test(line)) continue;
      if (ACP_TERMINAL_RE.test(line)) this.terminal = true;
      if (!this.lines.includes(line)) {
        this.lines.push(line);
        if (this.lines.length > 6) this.lines = this.lines.slice(-6);
      }
    }
  }

  /** 任意捕获行摘要（可能只是瞬时警告） */
  message(): string {
    if (this.lines.length === 0) return '';
    const prefix = `${this.provider} provider error: `;
    const pick = [...this.lines].reverse().find((l) => /error|failed|unauthorized|rate|quota|login/i.test(l));
    return (prefix + (pick ?? this.lines[this.lines.length - 1]!)).slice(0, 500);
  }

  /** 仅当出现终端失败标记时返回摘要（completed→failed 提升的唯一依据） */
  terminalMessage(): string {
    return this.terminal ? this.message() : '';
  }
}

// ── 工具名/文本提取（对齐 multica kimi.go kimiToolNameFromTitle + hermes.go extractACPToolCallText）──

/**
 * ACP 工具标题 → 稳定 snake_case 工具名。grok 用大写标题（"Read file: …"），
 * 与 kimi 同形态 → 走 kimiToolNameFromTitle 归一化；fallback 标题 snake_case。
 */
export function acpToolNameFromTitle(title: unknown, kind?: unknown): string {
  let t = typeof title === 'string' ? title.trim() : '';
  if (!t && typeof kind === 'string') t = kind.trim();
  if (!t) return '';
  if (t === 'execute code') return 'execute_code';
  if (t.includes(':')) t = t.slice(0, t.indexOf(':')).trim();
  const lower = t.toLowerCase().replace(/\s+/g, ' ');
  switch (lower) {
    case 'read':
    case 'read file':
      return 'read_file';
    case 'write':
    case 'write file':
      return 'write_file';
    case 'edit':
    case 'patch':
      return 'edit_file';
    case 'shell':
    case 'bash':
    case 'terminal':
    case 'run command':
    case 'run shell command':
      return 'terminal';
    case 'search':
    case 'grep':
    case 'find':
      return 'search_files';
    case 'glob':
      return 'glob';
    case 'web search':
      return 'web_search';
    case 'fetch':
    case 'web fetch':
    case 'extract':
      return 'web_fetch';
    case 'todo':
    case 'todo write':
      return 'todo_write';
    case 'delegate':
      return 'delegate_task';
    case 'think':
      return 'thinking';
    default:
      return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || lower;
  }
}

/** ACP output 字段可能是 JSON 字符串或结构化值 → 统一文本（防 object 被丢弃） */
export function acpRawText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return '';
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

/**
 * tool_call / tool_call_update 的 content 块 → 文本：
 * {type:'content', content:{type:'text',text}} 与 {type:'diff', path, oldText, newText}
 * （diff 只留最小头，防巨量 diff 灌入 run_message）。
 */
export function extractAcpToolCallText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    if (b.type === 'content') {
      const inner = b.content;
      if (inner && typeof inner === 'object') {
        const c = inner as Record<string, unknown>;
        if (c.type === 'text' && typeof c.text === 'string' && c.text) parts.push(c.text);
      }
    } else if (b.type === 'diff') {
      const path = typeof b.path === 'string' ? b.path : '';
      if (!path) continue;
      const oldLen = typeof b.oldText === 'string' ? b.oldText.length : 0;
      const newLen = typeof b.newText === 'string' ? b.newText.length : 0;
      parts.push(
        oldLen === 0
          ? `--- ${path}\n+++ ${path}\n(new file, ${newLen} bytes)`
          : `--- ${path}\n+++ ${path}\n(edited: ${oldLen} → ${newLen} bytes)`,
      );
    }
  }
  return parts.join('\n');
}

// ── 传输 ──

interface PendingRpc {
  method: string;
  resolve: (result: unknown) => void;
  reject: (err: unknown) => void;
}

const ACP_EXIT_GRACE_MS = 2000;

/**
 * ACP stdio 客户端传输：
 * - 行分隔 JSON 帧（实测钉死）；request/response 按 id 关联；writeMu 串行化 stdin
 * - agent→client request（session/request_permission 等）自动应答
 * - close()：stdin EOF → 有界等待退出 → 未退则 kill 进程树
 */
export class AcpTransport {
  private child: ChildProcess;
  private nextId = 1;
  private pending = new Map<number, PendingRpc>();
  private writeLock: Promise<void> = Promise.resolve();
  private exited = false;
  private buf = '';

  constructor(private readonly opts: AcpTransportOptions) {
    const spawnFn = opts.spawnFn ?? spawn;
    const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(opts.bin);
    this.child = spawnFn(opts.bin, opts.args, {
      cwd: opts.cwd,
      shell: isCmdShim,
      windowsHide: true,
      env: { ...process.env, ...(opts.env ?? {}) },
      detached: process.platform !== 'win32',
    });
    if (this.child.pid) {
      trackChildPid(this.child.pid);
      try {
        opts.onProcessStarted?.(this.child.pid);
      } catch {
        /* ownership observer must not break ACP startup */
      }
    }

    // abort → 拒绝所有 pending + kill 进程树（worker 取消/超时兜底）
    if (opts.signal) {
      const onAbort = () => {
        this.closeAllPending(new Error('ACP session aborted'));
        this.killTree();
      };
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    this.child.stdout?.setEncoding('utf8');
    this.child.stderr?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.onStdoutChunk(chunk));
    this.child.stderr?.on('data', (chunk: string) => {
      this.opts.callbacks?.onStderr?.(chunk);
    });
    this.child.on('error', (err) => {
      this.closeAllPending(new Error(`spawn ${opts.bin}: ${String(err)}`));
    });
    this.child.on('close', () => {
      this.exited = true;
      if (this.child.pid) untrackChildPid(this.child.pid);
      this.closeAllPending(new Error(`${opts.bin} process exited`));
    });
  }

  private killTree(): void {
    if (this.exited) return;
    try {
      if (this.child.pid) killProcessTree(this.child.pid);
      else this.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  private onStdoutChunk(chunk: string): void {
    this.buf += chunk;
    const parts = this.buf.split(/\r?\n/);
    this.buf = parts.pop() ?? '';
    for (const line of parts) {
      if (!line.trim()) continue;
      this.handleLine(line.trim());
    }
  }

  private handleLine(line: string): void {
    let j: unknown;
    try {
      j = JSON.parse(line);
    } catch {
      return; // 非 JSON 行忽略（CLI 偶发 banner）
    }
    if (!j || typeof j !== 'object') return;
    const o = j as Record<string, unknown>;

    const hasId = typeof o.id === 'number' || typeof o.id === 'string';
    const hasResult = o.result !== undefined;
    const hasError = o.error !== undefined;
    const hasMethod = typeof o.method === 'string';

    if (hasId && (hasResult || hasError)) {
      this.handleResponse(o);
      return;
    }
    if (hasId && hasMethod) {
      this.handleAgentRequest(o);
      return;
    }
    if (hasMethod) {
      this.handleNotification(o);
    }
  }

  private handleResponse(o: Record<string, unknown>): void {
    const id = Number(o.id);
    const pr = this.pending.get(id);
    if (!pr) return;
    this.pending.delete(id);

    if (o.error !== undefined && o.error !== null) {
      const e = o.error as Record<string, unknown>;
      let data = '';
      if (e.data !== undefined && e.data !== null) {
        data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
      }
      pr.reject(
        new AcpRpcError(pr.method, typeof e.code === 'number' ? e.code : -32603, String(e.message ?? 'unknown error'), data),
      );
      return;
    }
    pr.resolve(o.result ?? null);
  }

  private handleAgentRequest(o: Record<string, unknown>): void {
    const method = typeof o.method === 'string' ? o.method : '';
    const id = o.id;
    let resp: Record<string, unknown>;

    if (method === 'session/request_permission') {
      const params = o.params as Record<string, unknown> | undefined;
      const sel = selectAcpPermissionOption(params?.options);
      if (sel) {
        resp = {
          jsonrpc: '2.0',
          id,
          result: {
            outcome: { outcome: 'selected', optionId: sel.optionId },
          },
        };
      } else {
        resp = {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: 'no auto-selectable permission option offered' },
        };
      }
    } else {
      resp = {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `method not found: ${method}` },
      };
    }
    void this.writeLine(JSON.stringify(resp));
  }

  private handleNotification(o: Record<string, unknown>): void {
    const method = typeof o.method === 'string' ? o.method : '';
    if (method !== 'session/update' && method !== 'session/notification') {
      this.opts.callbacks?.onOtherNotification?.(method);
      return;
    }
    const params = (o.params ?? {}) as Record<string, unknown>;
    const update = normalizeAcpUpdate(params.update);
    if (!update.type) return;
    this.opts.callbacks?.onActivity?.();
    this.opts.callbacks?.onUpdate?.(update);
  }

  private writeLine(data: string): Promise<void> {
    const w = this.writeLock.then(() =>
      new Promise<void>((resolve, reject) => {
        this.child.stdin?.write(data + '\n', (err) => (err ? reject(err) : resolve()));
      }),
    );
    this.writeLock = w.catch(() => {});
    return w;
  }

  /** JSON-RPC request：id 关联 + 返回 result；超时/失败 reject AcpRpcError */
  async request(method: string, params: unknown, opts?: { timeoutMs?: number }): Promise<unknown> {
    if (this.exited) throw new Error(`${this.opts.bin} process already exited`);
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutMs = opts?.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 0;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        const pr = this.pending.get(id);
        if (pr) {
          this.pending.delete(id);
          pr.reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    }

    try {
      await this.writeLine(JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }));
    } catch (err) {
      const pr = this.pending.get(id);
      if (pr) {
        this.pending.delete(id);
        pr.reject(new Error(`write ${method}: ${String(err)}`));
      }
      if (timer) clearTimeout(timer);
    }

    try {
      return await result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** fire-and-forget notification（无响应 id） */
  notify(method: string, params: unknown): void {
    if (this.exited) return;
    void this.writeLine(JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {} }));
  }

  /**
   * 立即终止（超时/abort 兜底）：拒绝所有 pending + kill 进程树 + stdin EOF，
   * 不等进程自然退出。close() 是优雅路径（等 EOF 后自退），cancel() 是强制路径。
   */
  cancel(): void {
    this.closeAllPending(new Error('ACP session cancelled'));
    this.killTree();
    try {
      this.child.stdin?.end();
    } catch {
      /* 已关闭 */
    }
  }

  private closeAllPending(err: Error): void {
    for (const [id, pr] of this.pending) {
      this.pending.delete(id);
      pr.reject(err);
    }
  }

  /**
   * 关停：stdin EOF（让 agent 自行退出）→ 有界等待 → 未退则 kill 进程树。
   * 返回进程已确认退出。
   */
  async close(): Promise<void> {
    if (this.exited) return;
    try {
      this.child.stdin?.end();
    } catch {
      /* 已关闭 */
    }
    if (!this.exited) {
      await Promise.race([
        new Promise<void>((resolve) => {
          if (this.exited) resolve();
          else this.child.once('close', () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, ACP_EXIT_GRACE_MS)),
      ]);
    }
    if (!this.exited) {
      try {
        if (this.child.pid) killProcessTree(this.child.pid);
        else this.child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }

  /** 子进程已退出（stdout 关闭即触发） */
  get isExited(): boolean {
    return this.exited;
  }
}
