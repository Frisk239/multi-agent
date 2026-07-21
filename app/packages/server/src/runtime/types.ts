import type { RuntimeId } from '@ma/shared';
// 进程内 AgentEvent 仅 server 使用（不进 shared WS 契约）：

export type AgentEvent =
  | { type: 'message_delta'; text: string }
  | { type: 'message'; role: 'assistant' | 'user'; text: string }
  | { type: 'tool_start'; name: string; args?: unknown }
  | { type: 'tool_end'; name: string; result?: string }
  | { type: 'log'; text: string };

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
}

export interface ExecutionResult {
  finalText: string;
  exitReason: 'completed' | 'cancelled' | 'failed';
  error?: string;
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
