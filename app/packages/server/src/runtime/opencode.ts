import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, type LineContext } from './spawn-line.js';
import { extractTokenUsage } from './usage-parse.js';

export function parseOpencodeLine(
  line: string,
  onEvent: (e: AgentEvent) => void,
  ctx: LineContext,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  // 1. 尝试 JSON 格式解析（支持 opencode stream-json 模式或结构化日志）
  if (trimmed.startsWith('{')) {
    try {
      const j = JSON.parse(trimmed);
      if (typeof j === 'object' && j !== null) {
        // providerSessionId 捕获
        const sid = j.session_id ?? j.sessionId ?? j.session ?? j.id;
        if (typeof sid === 'string' && sid.trim()) {
          ctx.providerSessionId = sid.trim();
        }
        // token usage 解析
        const usage = extractTokenUsage(j);
        if (usage) ctx.usage = usage;

        // event 捕获
        if (j.type === 'message' && typeof j.text === 'string') {
          onEvent({ type: 'message', role: (j.role as 'assistant' | 'user') || 'assistant', text: j.text });
          return;
        }
        if (j.type === 'tool_start' && typeof j.name === 'string') {
          onEvent({ type: 'tool_start', name: j.name, args: j.args });
          return;
        }
        if (j.type === 'tool_end' && typeof j.name === 'string') {
          onEvent({ type: 'tool_end', name: j.name, result: j.result });
          return;
        }
      }
    } catch {
      /* ignore invalid JSON, fallthrough to regex */
    }
  }

  // 2. 文本模式：Token 统计文本正则解析 (例: "Tokens: 1500 input, 320 output" 或 "Prompt tokens: 1500, Completion tokens: 320")
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

  // 3. 文本模式：Session ID 正则捕获 (例: "Session ID: xxx" 或 "session: xxx")
  const sessionMatch = trimmed.match(/(?:session(?:\s*id)?)\s*[:=]\s*([a-zA-Z0-9_-]{8,})/i);
  if (sessionMatch && sessionMatch[1]) {
    ctx.providerSessionId = sessionMatch[1].trim();
  }
}

export class OpencodeBackend implements RuntimeBackend {
  readonly id = 'opencode' as const;
  readonly label = 'Opencode';
  /**
   * Slice 50：CLI 虽可能有 --session，策略层未验证可靠 resume/miss；
   * 声明 false，execute 忽略 resumeSessionId，不装会。
   */
  readonly supportsSessionResume = false;

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

    const args = ['run'];
    const model = input.model?.trim();
    if (model) args.push('--model', model);

    const variant = input.thinkingLevel?.trim();
    if (variant) args.push('--variant', variant);

    // Slice 50：supportsSessionResume=false → 忽略 input.resumeSessionId（不传假 --session）

    args.push(input.prompt);
    return spawnLineProcess(
      det.path,
      args,
      input.cwd,
      signal,
      onEvent,
      parseOpencodeLine,
      undefined,
      input.timeoutMs ? { timeoutMs: input.timeoutMs } : undefined,
    );
  }
}
