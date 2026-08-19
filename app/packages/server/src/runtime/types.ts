import type { RuntimeId, RunCommandInput, RunCommandResult } from '@ma/shared';
// 进程内 AgentEvent 仅 server 使用（不进 shared WS 契约）：

export type AgentEvent =
  | { type: 'message_delta'; text: string }
  | { type: 'message'; role: 'assistant' | 'user'; text: string }
  | { type: 'tool_start'; name: string; args?: unknown }
  | { type: 'tool_end'; name: string; result?: string }
  | { type: 'log'; text: string };

/** DS4：CLI 尽力解析的 token 用量（字段可空） */
export interface TokenUsage {
  input?: number | null;
  output?: number | null;
  cacheRead?: number | null;
  cacheWrite?: number | null;
}

export interface ExecutionInput {
  prompt: string;
  cwd: string;
  // bu03：quick_create 可无 issue
  issueId: string | null;
  agentId: string;
  runId: string;
  mcpServers?: string | null; // S05：MCP 配置 JSON 字符串（agent.mcpServers）
  // G22：agent.model；空则 backend 不传 --model
  model?: string | null;
  // DS4：agent.thinkingLevel；backend 能传则传，不能则忽略
  thinkingLevel?: string | null;
  /** chat 等短任务：CLI 硬超时（ms），防挂起变 orphan */
  timeoutMs?: number | null;
  /**
   * DS1 / Slice 50：仅 supportsSessionResume=true 的 backend 会消费
   * （策略层 resolvePriorSession 只在能力 true 时注入）。
   */
  resumeSessionId?: string | null;
  /**
   * G3-4b：agent.env_vars → 子进程 env（显式覆盖 process.env，key/value 已由
   * run-worker 从 agent 行 JSON 解析成对象；null/undefined 则原样 process.env）。
   */
  envVars?: Record<string, string> | null;
  /**
   * G3-4b：agent.custom_args → CLI argv 注入（各 backend 形态核对后在
   * args 构建处追加/插入；null/undefined 不注入）。
   */
  customArgs?: string[] | null;
  /**
   * G8-2: server-only spawn observer. Backends call it once a real child PID
   * exists so orchestration can persist a restart-safe ownership fingerprint.
   * It must never be sent over REST/WS or interpreted by a provider CLI.
   */
  onProcessStarted?: (pid: number) => void;
}

export interface ExecutionResult {
  finalText: string;
  exitReason: 'completed' | 'cancelled' | 'failed';
  error?: string;
  usage?: TokenUsage | null;
  /** DS1：CLI 报告的 provider session id（可空） */
  providerSessionId?: string | null;
}

export interface DetectResult {
  installed: boolean;
  version: string | null;
  path: string | null;
}

/**
 * A runtime preflight is an opt-in, adapter-specific check, not a synonym for
 * `detect()`/`--version`. It receives no prompt, agent config, custom args, MCP
 * configuration, or credential values so adapters cannot accidentally turn a
 * readiness check into an execution attempt.
 *
 * An implementation must be short-lived, honour `signal`, avoid project writes,
 * interactive login, session creation, and MCP startup. Production adapters stay
 * without a preflight until those safety properties are evidenced for that adapter.
 */
export interface RuntimePreflightContext {
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}

/**
 * Preflight failures use a closed set of safe classifications rather than a free
 * text error, preventing credentials, paths, or provider payloads from reaching
 * readiness APIs and UI surfaces.
 */
export type PreflightFailureReason =
  | 'auth_required'
  | 'configuration_invalid'
  | 'runtime_unavailable'
  | 'service_unavailable'
  | 'unknown';

export type PreflightResult =
  | { status: 'passed' }
  | { status: 'failed'; reason: PreflightFailureReason };

export interface RuntimeBackend {
  readonly id: RuntimeId;
  readonly label: string;
  /**
   * Whether this backend can really execute agent work.
   * Missing / undefined → treated as true (real adapters).
   * Explicit false → stub: readiness must not be ready; execute must fail honestly.
   */
  readonly executionImplemented?: boolean;
  /**
   * Slice 50：是否支持真 provider CLI session resume。
   * 仅显式 true 时策略层 resolvePriorSession 才注入 resumeSessionId。
   * Missing / undefined / false → unsupported（不走假 --resume 路径）。
   */
  readonly supportsSessionResume?: boolean;
  /** Agent.mcpServers 只有显式 true 才会进入该 adapter。 */
  readonly supportsMcpConfig?: boolean;
  /** Agent.customArgs 只有显式 true 才会进入该 adapter。 */
  readonly supportsCustomArgs?: boolean;
  /**
   * Agent.thinkingLevel 只有显式 true 才会写入 [thinking] log / 被 UI 当可编辑。
   * Missing / undefined / false → 不消费（Pi 等缺省不支持）。
   */
  readonly supportsThinkingLevel?: boolean;
  detect(): Promise<DetectResult>;
  /**
   * Optional documented-safe readiness check. See RuntimePreflightContext: do not
   * implement this with a general CLI launch, provider authentication, or session
   * handshake merely to make a runtime look verified.
   */
  preflight?(context: RuntimePreflightContext): Promise<PreflightResult>;
  execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult>;
  /**
   * G1-1：向运行中的子进程发 RPC 命令（pi steer / compact / set_model）。
   * 未实现 → 视为不支持（路由返回 501）。runId 即执行中的 agent_run。
   */
  sendRunCommand?(runId: string, command: RunCommandInput): Promise<RunCommandResult>;
}
