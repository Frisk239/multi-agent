import type { RuntimeId } from '@ma/shared';
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
  /** DS1：claude-code `--resume <id>`；其它 backend 忽略 */
  resumeSessionId?: string | null;
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

export interface RuntimeBackend {
  readonly id: RuntimeId;
  readonly label: string;
  detect(): Promise<DetectResult>;
  execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult>;
}
