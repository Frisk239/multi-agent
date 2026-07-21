import type { AgentRun } from '@ma/shared';

/** chat run → 回会话（重试语义在会话内「重发」） */
export function chatThreadHref(run: Pick<AgentRun, 'kind' | 'chatThreadId'>): string | null {
  if (run.kind !== 'chat' || !run.chatThreadId) return null;
  return `/chat?thread=${encodeURIComponent(run.chatThreadId)}`;
}

/** 无 issue 的 quick_create → 看板快速派活预填 */
export function qcRetryHref(run: Pick<AgentRun, 'quickPrompt'>): string {
  const qp = run.quickPrompt?.trim()
    ? `?quickPrompt=${encodeURIComponent(run.quickPrompt.trim())}`
    : '';
  return `/${qp}`;
}

export type RunRecoveryKind = 'issue_retry' | 'open_chat' | 'qc_redispatch' | 'none';

/** 失败/取消行主 CTA 类型（Mission Control 诚实分支） */
export function runRecoveryKind(
  run: Pick<AgentRun, 'kind' | 'status' | 'issueId' | 'chatThreadId'>,
): RunRecoveryKind {
  const terminal = run.status === 'failed' || run.status === 'cancelled';
  if (!terminal) return 'none';
  if (run.kind === 'chat') return run.chatThreadId ? 'open_chat' : 'none';
  if (run.issueId) return 'issue_retry';
  if (run.kind === 'quick_create' || !run.issueId) return 'qc_redispatch';
  return 'none';
}
