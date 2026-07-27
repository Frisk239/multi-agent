/**
 * Slice 60 · Runtime 捕获能力契约表（诚实文档，非 resume）。
 * usage / tool / providerSessionId 尽力捕获；resume 仍走 session-resume 矩阵。
 */
import type { RuntimeId } from '@ma/shared';

export type CaptureSignal = 'usage' | 'tool' | 'providerSessionId';

export type RuntimeCaptureRow = {
  runtime: RuntimeId;
  /** 行解析可抽 token usage（终态或逐步累加） */
  usage: boolean;
  /** tool_start / tool_end 事件 */
  tool: boolean;
  /** stream 可写 providerSessionId（不代表 supportsSessionResume） */
  providerSessionId: boolean;
  /** 捕获缺口说明（analytics / 运维对照 uncosted no_tokens） */
  gapNote: string;
};

/**
 * 契约表：与 unit fixture 对齐。
 * - claude-code：stream-json result usage + tool blocks + session_id
 * - opencode：--format json step_finish tokens + tool_use + sessionID
 * - cursor：result usage + tool_call envelope + session_id
 * - grok：尽力 JSON-RPC（不稳定）；session/usage 尽力
 * - pi：无真执行 → 无捕获
 */
export function runtimeCaptureCapabilityMatrix(): RuntimeCaptureRow[] {
  return [
    {
      runtime: 'claude-code',
      usage: true,
      tool: true,
      providerSessionId: true,
      gapNote: 'result 行无 usage 时 uncosted/no_tokens',
    },
    {
      runtime: 'opencode',
      usage: true,
      tool: true,
      providerSessionId: true,
      gapNote: '无 step_finish.tokens 时 uncosted/no_tokens；resume 仍 unsupported',
    },
    {
      runtime: 'cursor',
      usage: true,
      tool: true,
      providerSessionId: true,
      gapNote: 'result 无 usage 时 uncosted/no_tokens；resume 仍 unsupported',
    },
    {
      runtime: 'grok',
      usage: true,
      tool: true,
      providerSessionId: true,
      gapNote: '非完整 ACP：流不稳定时可全空 → no_tokens；resume unsupported',
    },
    {
      runtime: 'pi',
      usage: false,
      tool: false,
      providerSessionId: false,
      gapNote: 'executionImplemented=false，无 CLI 捕获路径',
    },
  ];
}
