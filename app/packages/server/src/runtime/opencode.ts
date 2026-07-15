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
    // spike 钉死 argv：opencode run "<prompt>"
    // opencode 无稳定 JSON 流（spike 确认输出纯文本含 ANSI 色码）→ 走 spec R5 降级：
    // onLine=null，spawn-line 在结束时把整段 stdout（剥 ANSI）作一条 assistant message。
    return spawnLineProcess(
      det.path,
      ['run', input.prompt],
      input.cwd,
      signal,
      onEvent,
      null,
    );
  }
}
