/**
 * Slice 65 · Inbox / Run 主 CTA 选择（纯函数 · web UI 真源）
 *
 * 规则（主按钮只有一个）：
 * - chat 失败 / chat run → 打开会话
 * - run_failed + runId（有 issue 或 issue 类）→ 再执行（走既有 retry API，勿假造）
 * - run_failed + runId（无 issue / quick_create）→ 查看运行（重派在详情智能恢复里）
 * - waiting / waiting_local / deferred → 查看运行（有 runId）或 issue
 * - 其它有 runId → 查看运行
 * - 仅有 issueId → 打开 Issue
 * - 否则 none
 */

export type InboxPrimaryCtaKind =
  | 'retry'
  | 'open_run'
  | 'open_issue'
  | 'open_chat'
  | 'none';

export type InboxPrimaryCta = {
  kind: InboxPrimaryCtaKind;
  href?: string;
  label: string;
};

/** 足够驱动 CTA 的 inbox / run 提示字段（不强绑完整 InboxItem） */
export type InboxCtaSource = {
  kind?: string | null;
  type?: string | null;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  runId?: string | null;
  issueId?: string | null;
  /** 可选：关联 run 状态（waiting / deferred / failed…） */
  runStatus?: string | null;
  /** 可选：关联 run.kind（chat / issue / quick_create） */
  runKind?: string | null;
  chatThreadId?: string | null;
};

function isFailKind(item: InboxCtaSource): boolean {
  return item.kind === 'run_failed' || item.type === 'run_failed';
}

function isChatish(item: InboxCtaSource): boolean {
  if (item.runKind === 'chat') return true;
  const blob = `${item.title ?? ''} ${item.summary ?? ''} ${item.body ?? ''}`;
  return /聊天失败|聊天/.test(blob);
}

function isWaitingStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (
    status === 'waiting' ||
    status === 'waiting_local' ||
    status === 'waiting_local_directory'
  );
}

function isDeferredStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === 'deferred' || status === 'run_deferred';
}

function isTerminalFailStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'timed_out'
  );
}

/** 构造 /runs?run=… 深链（失败默认带 status=failed） */
export function inboxRunHref(item: InboxCtaSource): string | null {
  if (!item.runId) {
    if (isFailKind(item) || isTerminalFailStatus(item.runStatus)) {
      return '/runs?status=failed';
    }
    if (isWaitingStatus(item.runStatus)) {
      return '/runs?status=waiting_local_directory';
    }
    return null;
  }
  const sp = new URLSearchParams();
  sp.set('run', item.runId);
  if (isFailKind(item) || isTerminalFailStatus(item.runStatus)) {
    sp.set('status', 'failed');
  } else if (item.kind === 'run_completed' || item.type === 'run_completed') {
    sp.set('status', 'completed');
  } else if (isWaitingStatus(item.runStatus)) {
    sp.set('status', 'waiting_local_directory');
  } else {
    sp.set('status', 'all');
  }
  return `/runs?${sp.toString()}`;
}

function chatHref(item: InboxCtaSource): string {
  if (item.chatThreadId) {
    return `/chat?thread=${encodeURIComponent(item.chatThreadId)}`;
  }
  return '/chat';
}

function issueHref(issueId: string): string {
  return `/issues/${encodeURIComponent(issueId)}`;
}

/**
 * 为 Inbox 条目解析唯一主 CTA。
 * 不发起网络请求；retry 仅表示 UI 应挂既有 useRetryRun / 智能恢复按钮。
 */
export function resolveInboxPrimaryCta(item: InboxCtaSource): InboxPrimaryCta {
  const fail = isFailKind(item) || isTerminalFailStatus(item.runStatus);
  const waiting = isWaitingStatus(item.runStatus);
  const deferred = isDeferredStatus(item.runStatus);

  // chat 优先：失败也回会话，勿假 Issue retry
  if (isChatish(item) && (fail || item.runKind === 'chat')) {
    return {
      kind: 'open_chat',
      href: chatHref(item),
      label: '打开会话',
    };
  }

  // 失败 + runId：有 issue → 再执行；无 issue → 查看运行（勿造假 retry）
  if (fail && item.runId) {
    if (item.issueId || item.runKind === 'issue') {
      return {
        kind: 'retry',
        href: inboxRunHref(item) ?? undefined,
        label: '再执行',
      };
    }
    // quick_create / 无 issue：主按钮看运行（详情里仍可走智能恢复）
    return {
      kind: 'open_run',
      href: inboxRunHref(item) ?? `/runs?run=${encodeURIComponent(item.runId)}&status=failed`,
      label: '查看运行',
    };
  }

  // 失败无 runId：尽量进 runs 失败列表或 issue
  if (fail) {
    if (item.issueId) {
      return {
        kind: 'open_issue',
        href: issueHref(item.issueId),
        label: '打开 Issue',
      };
    }
    const href = inboxRunHref(item);
    if (href) {
      return { kind: 'open_run', href, label: '查看运行' };
    }
  }

  // waiting / deferred
  if (waiting || deferred) {
    const runHref = inboxRunHref(item);
    if (runHref) {
      return { kind: 'open_run', href: runHref, label: '查看运行' };
    }
    if (item.issueId) {
      return {
        kind: 'open_issue',
        href: issueHref(item.issueId),
        label: '打开 Issue',
      };
    }
  }

  // 有 runId 的其它通知（完成等）→ 查看运行
  if (item.runId) {
    const href = inboxRunHref(item);
    if (href) {
      return { kind: 'open_run', href, label: '查看运行' };
    }
  }

  // 仅 issue
  if (item.issueId) {
    return {
      kind: 'open_issue',
      href: issueHref(item.issueId),
      label: '打开 Issue',
    };
  }

  // 聊天类无 run 的兜底
  if (isChatish(item)) {
    return {
      kind: 'open_chat',
      href: chatHref(item),
      label: '打开会话',
    };
  }

  return { kind: 'none', label: '' };
}

/** 是否算「需处理」条目（失败 / 等待 / deferred / 未读 action 类） */
export function isActionableInboxItem(item: InboxCtaSource & {
  read?: boolean;
  severity?: string | null;
}): boolean {
  if (isFailKind(item) || isTerminalFailStatus(item.runStatus)) return true;
  if (isWaitingStatus(item.runStatus) || isDeferredStatus(item.runStatus)) return true;
  if (item.severity === 'action_required') return true;
  return false;
}
