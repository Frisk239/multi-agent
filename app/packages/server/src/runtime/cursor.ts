import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, type LineContext } from './spawn-line.js';
import { parseUsageFromResultLine } from './usage-parse.js';
import { safeFormatToolError } from './event-normalizer.js';

function safeStringifyResult(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content ?? '').slice(0, 4000);
  } catch (err) {
    return safeFormatToolError(err);
  }
}

/** Cursor call_id 偶发 "call-…\nfc_…" 双行；取第一行（Multica cursorCallID） */
function normalizeCursorCallId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const id = raw.trim();
  const nl = id.indexOf('\n');
  return (nl >= 0 ? id.slice(0, nl) : id).trim();
}

/**
 * 解析 Cursor `tool_call` 信封：
 * `{"type":"tool_call","subtype":"started","call_id":"…",
 *   "tool_call":{"readToolCall":{"args":{…}}}}`
 */
export function parseCursorToolCallEnvelope(j: Record<string, unknown>): {
  name: string;
  callId: string;
  input: unknown;
  result: unknown;
} {
  let callId = normalizeCursorCallId(j.call_id ?? j.callId);
  const envelope = j.tool_call ?? j.toolCall;
  if (!envelope || typeof envelope !== 'object') {
    return {
      name: String(j.tool_name ?? j.toolName ?? 'tool'),
      callId,
      input: j.parameters ?? j.args ?? j.input,
      result: j.output ?? j.result,
    };
  }
  const env = envelope as Record<string, unknown>;
  if (!callId) callId = normalizeCursorCallId(env.toolCallId ?? env.call_id);

  const suffix = 'ToolCall';
  const keys = Object.keys(env)
    .filter((k) => k.length > suffix.length && k.endsWith(suffix))
    .sort();
  if (keys.length === 0) {
    return {
      name: String(j.tool_name ?? j.toolName ?? 'tool'),
      callId,
      input: j.parameters ?? j.args,
      result: j.output,
    };
  }
  const key = keys[0];
  const name = key.slice(0, -suffix.length) || 'tool';
  const payload = env[key];
  let input: unknown;
  let result: unknown;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    input = p.args ?? p.input ?? p.parameters;
    result = p.result ?? p.output;
  }
  return { name, callId, input, result };
}

// parseCursorLine —— 对齐 multica cursor.go 的 cursorStreamEvent 解析。
// Cursor agent 的 stream-json（multica testdata + deep §5）：
//   {"type":"system","subtype":"init","session_id":…}
//   {"type":"assistant","message":{content}}
//   {"type":"tool_call","subtype":"started|completed","tool_call":{…ToolCall}}
//   {"type":"tool_use"/"tool_result"}  legacy
//   {"type":"result","result":"…","usage":{inputTokens…}}
// Cursor CLI 可能给行加 "stdout:"/"stderr:" 前缀。
export function parseCursorLine(
  line: string,
  onEvent: (e: AgentEvent) => void,
  ctx: LineContext,
): void {
  // 剥 stdout:/stderr: 前缀（对齐 multica cursorStreamPrefixRe）
  const trimmed = line.replace(/^\s*(stdout|stderr)\s*[:=]?\s*/i, '').trim();
  if (!trimmed) return;
  let j: Record<string, any>;
  try {
    j = JSON.parse(trimmed);
  } catch {
    return;
  }

  // DS1 / Slice 60: providerSessionId
  const sid = j.session_id ?? j.sessionId ?? j.conversation_id ?? j.session;
  if (typeof sid === 'string' && sid.trim()) {
    ctx.providerSessionId = sid.trim();
  }

  switch (j.type) {
    case 'system':
      onEvent({ type: 'log', text: `[cursor] ${j.subtype ?? 'system'}` });
      break;
    case 'assistant': {
      const blocks = (j.message as any)?.content;
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if ((b.type === 'text' || b.type === 'output_text') && typeof b.text === 'string' && b.text) {
            onEvent({ type: 'message', role: 'assistant', text: b.text });
          } else if (b.type === 'tool_use' && typeof b.name === 'string') {
            onEvent({ type: 'tool_start', name: b.name, args: b.input });
          }
        }
      }
      break;
    }
    case 'thinking': {
      // Multica：thinking delta 不进 finalText；这里记 log 便于 live 可见
      if (j.subtype === 'delta' && typeof j.text === 'string' && j.text) {
        onEvent({ type: 'log', text: `[cursor] thinking: ${String(j.text).slice(0, 200)}` });
      }
      break;
    }
    case 'tool_call': {
      const call = parseCursorToolCallEnvelope(j);
      const subtype = typeof j.subtype === 'string' ? j.subtype : '';
      if (subtype === 'started') {
        onEvent({
          type: 'tool_start',
          name: call.name || 'tool',
          args: call.input,
        });
      } else if (subtype === 'completed') {
        // 若 started 漏解析，completed 仍尽量补 tool_end
        onEvent({
          type: 'tool_end',
          name: call.name || 'tool',
          result: safeStringifyResult(call.result ?? ''),
        });
      }
      // 其它 subtype（progress 等）忽略，避免假 tool_end
      break;
    }
    case 'tool_use':
      onEvent({
        type: 'tool_start',
        name: String(j.tool_name ?? j.toolName ?? 'tool'),
        args: j.parameters ?? j.args ?? j.input,
      });
      break;
    case 'tool_result':
      onEvent({
        type: 'tool_end',
        name: String(j.tool_name ?? j.toolName ?? 'tool'),
        result: safeStringifyResult(j.output ?? j.result),
      });
      break;
    case 'result':
      // 终态行：.result 是 finalText（对齐 multica cursor.go）
      if (typeof j.result === 'string') {
        ctx.resultText = j.result;
      }
      // DS4 / Slice 60：usage 尽力（嵌套 usage + 顶层 camelCase）
      {
        const usage = parseUsageFromResultLine(j);
        if (usage) ctx.usage = usage;
      }
      break;
    case 'error': {
      const msg =
        (typeof j.error === 'string' && j.error) ||
        (typeof j.message === 'string' && j.message) ||
        'cursor error';
      onEvent({ type: 'log', text: `[cursor] error: ${msg}` });
      break;
    }
  }
}

/**
 * Pure argv builder for cursor-agent.
 * Multica `pkg/agent/cursor.go` buildCursorArgs: `--resume <id>` when set.
 * Prompt stays on `-p` (existing local shape; Multica may use stdin — not required for resume).
 */
export function buildCursorArgs(
  input: Pick<ExecutionInput, 'prompt' | 'model' | 'thinkingLevel' | 'resumeSessionId'>,
): string[] {
  const args = ['-p', input.prompt, '--output-format', 'stream-json', '--yolo', '--trust'];
  const model = input.model?.trim();
  if (model) args.push('--model', model);

  const variant = input.thinkingLevel?.trim();
  if (variant) args.push('--variant', variant);

  const resume = input.resumeSessionId?.trim();
  if (resume) args.push('--resume', resume);

  return args;
}

export class CursorBackend implements RuntimeBackend {
  readonly id = 'cursor' as const;
  readonly label = 'Cursor';
  /**
   * Phase 2026-07-30：对齐 Multica cursor `--resume` + session 捕获/poison/force_fresh 闭环。
   */
  readonly supportsSessionResume = true;

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('CURSOR_PATH', ['cursor-agent', 'cursor']);
    if (!path) return { installed: false, version: null, path: null };
    return { installed: true, version: await versionOf(path), path };
  }

  async execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) return { finalText: '', exitReason: 'failed', error: 'cursor CLI 未安装' };

    const args = buildCursorArgs(input);
    return spawnLineProcess(
      det.path,
      args,
      input.cwd,
      signal,
      onEvent,
      parseCursorLine,
      undefined,
      input.timeoutMs ? { timeoutMs: input.timeoutMs } : undefined,
    );
  }
}
