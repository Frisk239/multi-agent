import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';

/** Slice 44：Pi 适配器尚未实现真实 CLI/SDK 执行，禁止假 completed。 */
export const PI_NOT_IMPLEMENTED_ERROR =
  'Pi 适配器尚未实现真实 CLI/SDK 执行，禁止假完成。请改用已实现的 runtime（如 claude-code），或等待 Pi 执行能力落地。';

export const PI_NOT_INSTALLED_ERROR =
  'Pi SDK / CLI 未安装。请在系统 PATH 中安装 `pi` 命令，或设置 PI_PATH 环境变量。';

export class PiBackend implements RuntimeBackend {
  readonly id = 'pi' as const;
  readonly label = 'Pi SDK';
  /** H1：未实现真实执行；readiness 不得 ready，execute 不得 silent completed */
  readonly executionImplemented = false;

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('PI_PATH', ['pi']);
    if (!path) return { installed: false, version: null, path: null };
    const version = await versionOf(path);
    return { installed: true, version, path };
  }

  async execute(
    _input: ExecutionInput,
    _onEvent: (e: AgentEvent) => void,
    _signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.installed) {
      return {
        finalText: '',
        exitReason: 'failed',
        error: PI_NOT_INSTALLED_ERROR,
      };
    }
    // 已安装也不假完成：适配器本身未接真实 agent loop
    return {
      finalText: '',
      exitReason: 'failed',
      error: PI_NOT_IMPLEMENTED_ERROR,
    };
  }
}
