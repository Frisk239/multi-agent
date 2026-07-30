/**
 * F5 · HelperRail ↔ Chat critical-path alignment (pure).
 */

export type HelperFailCta = {
  show: boolean;
  label: string;
  /** Relative href to recover or inspect. */
  href: string;
};

export function buildHelperFailCta(input: {
  readinessStatus?: string | null;
  lastSendError?: string | null;
  threadId?: string | null;
}): HelperFailCta {
  if (input.lastSendError) {
    return {
      show: true,
      label: '打开全页 Chat 查看',
      href: input.threadId
        ? `/chat?thread=${encodeURIComponent(input.threadId)}`
        : '/chat',
    };
  }
  if (
    input.readinessStatus &&
    input.readinessStatus !== 'ready' &&
    input.readinessStatus !== 'busy'
  ) {
    return {
      show: true,
      label: '去 Agents / Settings 恢复',
      href: '/settings',
    };
  }
  return { show: false, label: '', href: '' };
}

/** Prefer sticky bottom when last message is streaming assistant (Chat parity). */
export function shouldStickHelperScroll(input: {
  messageCount: number;
  lastRole?: string | null;
  userNearBottom?: boolean;
}): boolean {
  if (input.messageCount <= 0) return true;
  if (input.userNearBottom === false) return false;
  return input.lastRole === 'assistant' || input.lastRole === 'user' || !input.lastRole;
}
