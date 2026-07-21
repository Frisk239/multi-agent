import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, type LineContext } from './spawn-line.js';

// parseCursorLine —— 对齐 multica cursor.go 的 cursorStreamEvent 解析。
// Cursor agent 的 stream-json 与 Claude 高度同构（multica deep §5 + 本机 spike）：
//   {"type":"system","subtype":"init"}        → status
//   {"type":"assistant","message":{content}}  → text / tool_use block
//   {"type":"tool_use","tool_name":...}        → tool_start
//   {"type":"tool_result","output":...}        → tool_end
//   {"type":"result","result":"<finalText>"}   → 覆盖 ctx.resultText
// Cursor CLI 可能给行加 "stdout:"/"stderr:" 前缀（对齐 multica normalizeCursorStreamLine）。
function parseCursorLine(
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
  switch (j.type) {
    case 'system':
      onEvent({ type: 'log', text: `[cursor] ${j.subtype ?? 'system'}` });
      break;
    case 'assistant': {
      const blocks = j.message?.content;
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
    case 'tool_use':
      onEvent({ type: 'tool_start', name: String(j.tool_name ?? 'tool'), args: j.parameters });
      break;
    case 'tool_result':
      onEvent({
        type: 'tool_end',
        name: String(j.tool_name ?? 'tool'),
        result: typeof j.output === 'string' ? j.output : JSON.stringify(j.output ?? '').slice(0, 4000),
      });
      break;
    case 'result':
      // 终态行：.result 是 finalText（对齐 multica cursor.go:150）
      if (typeof j.result === 'string') {
        ctx.resultText = j.result;
      }
      break;
  }
}

export class CursorBackend implements RuntimeBackend {
  readonly id = 'cursor' as const;
  readonly label = 'Cursor';

  async detect(): Promise<DetectResult> {
    // spike 确认：本机 headless 入口是 cursor-agent（非 cursor 编辑器本体）。
    // cursor-agent.cmd 经 where 解析，versionOf 取 --version（注意 .cmd 需 shell）。
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
    // spike + multica buildCursorArgs 钉死 argv：
    //   cursor-agent -p <prompt> --output-format stream-json --yolo --trust
    // --yolo(--force) = 自动批准工具调用；--trust = 信任 cwd（非交互必需）。
    // spike 实测：本机 cursor-agent 版本把 trust 和 force 分开，仅 --yolo 会
    // 报 "Workspace Trust Required" 退出，必须额外加 --trust（multica 版本可能不同）。
    // cursor-agent 是 stream-json backend（与 opencode 的降级不同）。
    // G22：有 model 时追加 --model（CLI 不支持时会失败并体现在 run error，便于用户改回空）
    const args = ['-p', input.prompt, '--output-format', 'stream-json', '--yolo', '--trust'];
    const model = input.model?.trim();
    if (model) args.push('--model', model);
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
