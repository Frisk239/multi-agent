import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, type LineContext } from './spawn-line.js';
import {
  extractOpencodeStepTokens,
  extractTokenUsage,
  mergeUsage,
} from './usage-parse.js';
import { scrubAndTruncateToolResult } from './secret-scrubber.js';

function safeStringifyResult(content: unknown): string {
  return scrubAndTruncateToolResult(content);
}

function pickOpencodeSessionId(j: Record<string, unknown>): string | null {
  const part = (j.part && typeof j.part === 'object' ? j.part : null) as Record<
    string,
    unknown
  > | null;
  const candidates = [
    j.sessionID,
    j.sessionId,
    j.session_id,
    j.session,
    part?.sessionID,
    part?.sessionId,
    part?.session_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/**
 * OpenCode `run --format json` 行解析（对齐 Multica opencode.go processEvents）。
 * 捕获：providerSessionId / tool 事件 / step_finish tokens 累加 / text。
 * Slice 60 加深捕获；2026-07-30 开通 supportsSessionResume + --session 注入。
 */
export function parseOpencodeLine(
  line: string,
  onEvent: (e: AgentEvent) => void,
  ctx: LineContext,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  // 1. JSON 流（`--format json`）
  if (trimmed.startsWith('{')) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof j !== 'object' || j === null) return;

      const sid = pickOpencodeSessionId(j);
      if (sid) ctx.providerSessionId = sid;

      // 顶层 / 嵌套 usage 尽力（非 step_finish 时）
      const topUsage = extractTokenUsage(j) ?? extractTokenUsage(j.usage);
      if (topUsage) ctx.usage = mergeUsage(ctx.usage, topUsage);

      const type = typeof j.type === 'string' ? j.type : '';
      const part =
        j.part && typeof j.part === 'object'
          ? (j.part as Record<string, unknown>)
          : null;

      switch (type) {
        case 'text': {
          const text =
            (typeof part?.text === 'string' && part.text) ||
            (typeof j.text === 'string' && j.text) ||
            '';
          if (text) {
            onEvent({ type: 'message', role: 'assistant', text });
            // 无 result 终态时用 text 拼 finalText 兜底
            ctx.resultText = (ctx.resultText ?? '') + text;
          }
          return;
        }
        case 'tool_use': {
          // Multica: part.tool + part.state.{status,input,output}
          const toolName =
            (typeof part?.tool === 'string' && part.tool) ||
            (typeof j.name === 'string' && j.name) ||
            (typeof j.tool === 'string' && j.tool) ||
            'tool';
          const state =
            part?.state && typeof part.state === 'object'
              ? (part.state as Record<string, unknown>)
              : null;
          const input = state?.input ?? j.args ?? j.input;
          onEvent({ type: 'tool_start', name: toolName, args: input });
          if (state && (state.status === 'completed' || state.status === 'error')) {
            const out =
              state.status === 'error'
                ? (state.error ?? state.output ?? 'tool error')
                : (state.output ?? '');
            onEvent({
              type: 'tool_end',
              name: toolName,
              result: safeStringifyResult(out),
            });
          }
          return;
        }
        case 'step_finish': {
          const tokens = part?.tokens ?? j.tokens;
          const stepUsage = extractOpencodeStepTokens(tokens);
          if (stepUsage) ctx.usage = mergeUsage(ctx.usage, stepUsage);
          return;
        }
        case 'step_start': {
          onEvent({ type: 'log', text: '[opencode] step_start' });
          return;
        }
        case 'error': {
          const errObj =
            j.error && typeof j.error === 'object'
              ? (j.error as Record<string, unknown>)
              : null;
          const errData =
            errObj?.data && typeof errObj.data === 'object'
              ? (errObj.data as Record<string, unknown>)
              : null;
          const msg =
            (typeof errData?.message === 'string' && errData.message) ||
            (typeof errObj?.message === 'string' && errObj.message) ||
            (typeof j.message === 'string' && j.message) ||
            'opencode error';
          onEvent({ type: 'log', text: `[opencode] error: ${msg}` });
          return;
        }
        case 'message': {
          if (typeof j.text === 'string') {
            onEvent({
              type: 'message',
              role: (j.role as 'assistant' | 'user') || 'assistant',
              text: j.text,
            });
          }
          return;
        }
        case 'tool_start': {
          if (typeof j.name === 'string') {
            onEvent({ type: 'tool_start', name: j.name, args: j.args });
          }
          return;
        }
        case 'tool_end': {
          if (typeof j.name === 'string') {
            onEvent({
              type: 'tool_end',
              name: j.name,
              result:
                typeof j.result === 'string'
                  ? j.result
                  : safeStringifyResult(j.result),
            });
          }
          return;
        }
        default:
          // 未知 type：已尽力取 session/usage，忽略事件
          return;
      }
    } catch {
      /* fallthrough to regex */
    }
  }

  // 2. 文本模式：Token 统计
  const inputMatch = trimmed.match(/(?:input|prompt)\s*tokens?\s*[:=]?\s*(\d+)/i);
  const outputMatch = trimmed.match(/(?:output|completion)\s*tokens?\s*[:=]?\s*(\d+)/i);
  if (inputMatch || outputMatch) {
    const inputVal = inputMatch ? Number.parseInt(inputMatch[1], 10) : undefined;
    const outputVal = outputMatch ? Number.parseInt(outputMatch[1], 10) : undefined;
    ctx.usage = {
      ...(ctx.usage ?? {}),
      ...(inputVal !== undefined ? { input: inputVal } : {}),
      ...(outputVal !== undefined ? { output: outputVal } : {}),
    };
  }

  // 3. 文本模式：Session ID
  const sessionMatch = trimmed.match(
    /(?:session(?:\s*id)?)\s*[:=]\s*([a-zA-Z0-9_-]{8,})/i,
  );
  if (sessionMatch?.[1]) {
    ctx.providerSessionId = sessionMatch[1].trim();
  }
}

/**
 * Pure argv builder for opencode run.
 * Multica `pkg/agent/opencode.go`: `--session <id>` when ResumeSessionID set.
 */
export function buildOpencodeArgs(
  input: Pick<
    ExecutionInput,
    'prompt' | 'model' | 'thinkingLevel' | 'resumeSessionId' | 'customArgs'
  >,
): string[] {
  // Multica：`opencode run --format json` —— 结构化捕获依赖 json 流
  const args = ['run', '--format', 'json'];
  const model = input.model?.trim();
  if (model) args.push('--model', model);

  const variant = input.thinkingLevel?.trim();
  if (variant) args.push('--variant', variant);

  const resume = input.resumeSessionId?.trim();
  if (resume) args.push('--session', resume);

  // G3-4b：custom_args 插在 prompt 位置参数之前（opencode run 的 prompt 是末尾
  // 位置参数，追加在尾部会被当成额外消息/报错 —— 形态核对结论）
  const customArgs = input.customArgs?.length ? input.customArgs : [];
  args.push(...customArgs, input.prompt);
  return args;
}

export class OpencodeBackend implements RuntimeBackend {
  readonly id = 'opencode' as const;
  readonly label = 'Opencode';
  /**
   * Phase 2026-07-30：对齐 Multica opencode `--session` + session 捕获/poison/force_fresh 闭环。
   * 策略层 resolvePriorSession 仅在 supportsSessionResume=true 时注入 resumeSessionId。
   */
  readonly supportsSessionResume = true;
  readonly supportsMcpConfig = false;
  readonly supportsCustomArgs = true;
  readonly supportsThinkingLevel = true;

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('OPENCODE_PATH', ['opencode']);
    if (!path) return { installed: false, version: null, path: null };
    return { installed: true, version: await versionOf(path), path };
  }

  async execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) return { finalText: '', exitReason: 'failed', error: 'opencode CLI 未安装' };

    const args = buildOpencodeArgs(input);
    const opts: {
      timeoutMs?: number;
      env?: NodeJS.ProcessEnv;
      onProcessStarted?: (pid: number) => void;
    } = {};
    if (input.timeoutMs) opts.timeoutMs = input.timeoutMs;
    // G3-4b：agent.env_vars 显式覆盖子进程 env
    if (input.envVars) opts.env = input.envVars;
    if (input.onProcessStarted) opts.onProcessStarted = input.onProcessStarted;
    return spawnLineProcess(
      det.path,
      args,
      input.cwd,
      signal,
      onEvent,
      parseOpencodeLine,
      undefined,
      opts,
    );
  }
}
