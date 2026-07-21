import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess } from './spawn-line.js';

export class OpencodeBackend implements RuntimeBackend {
  readonly id = 'opencode' as const;
  readonly label = 'Opencode';

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
    // spike 钉死 argv：opencode run [flags] "<prompt>"
    // G22：有 model 时插 --model（对齐 Multica opencode.go opts.Model）
    // opencode 无稳定 JSON 流（spike 确认输出纯文本含 ANSI 色码）→ 走 spec R5 降级：
    // onLine=null，spawn-line 在结束时把整段 stdout（剥 ANSI）作一条 assistant message。
    const args = ['run'];
    const model = input.model?.trim();
    if (model) args.push('--model', model);
    args.push(input.prompt);
    return spawnLineProcess(
      det.path,
      args,
      input.cwd,
      signal,
      onEvent,
      null,
    );
  }
}
