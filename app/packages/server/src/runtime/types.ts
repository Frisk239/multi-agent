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
  issueId: string;
  agentId: string;
  runId: string;
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
