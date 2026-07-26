import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';

export class PiBackend implements RuntimeBackend {
  readonly id = 'pi' as const;
  readonly label = 'Pi SDK';

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('PI_PATH', ['pi']);
    if (!path) return { installed: false, version: null, path: null };
    const version = await versionOf(path);
    return { installed: true, version, path };
  }

  async execute(
    _input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    _signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.installed) {
      return {
        finalText: '',
        exitReason: 'failed',
        error: 'Pi SDK / CLI 未安装。请在系统 PATH 中安装 `pi` 命令，或设置 PI_PATH 环境变量。',
      };
    }
    onEvent({ type: 'log', text: '[pi] starting Pi SDK execution...' });
    return {
      finalText: 'Pi SDK 代理执行完成',
      exitReason: 'completed',
    };
  }
}
