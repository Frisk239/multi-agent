// P2-B：Inbox 通知偏好（~/.multi-agent/inbox-prefs.json）
// env MA_INBOX_NOTIFY_SUCCESS=1 仍强制开启 issue 成功推送。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type InboxPrefs = {
  /** 是否推送 issue run completed（默认 false，F10 降噪） */
  notifyIssueSuccess: boolean;
  notifyTypes: {
    comment: boolean;
    run_completed: boolean;
    run_failed: boolean;
    assigned: boolean;
  };
  notifySeverities: {
    action_required: boolean;
    attention: boolean;
    info: boolean;
  };
  /**
   * Slice 70：Deferred 可选升级（queued 过久未 claim → inbox + 建议改派草稿）。
   * **默认 false**；与 env `MA_DEFERRED_AUTO_ESCALATE=1` 等价 opt-in。
   * 阈值仍可由 `MA_DEFERRED_UNCLAIMED_MS` 覆盖；未设时用建议 30min。
   */
  deferredAutoEscalate: boolean;
};

const DEFAULTS: InboxPrefs = {
  notifyIssueSuccess: false,
  notifyTypes: {
    comment: true,
    run_completed: true,
    run_failed: true,
    assigned: true,
  },
  notifySeverities: {
    action_required: true,
    attention: true,
    info: true,
  },
  deferredAutoEscalate: false,
};

function prefsPath(): string {
  return join(homedir(), '.multi-agent', 'inbox-prefs.json');
}

export function readInboxPrefs(): InboxPrefs {
  const p = prefsPath();
  if (!existsSync(p)) return { ...DEFAULTS, notifyTypes: { ...DEFAULTS.notifyTypes }, notifySeverities: { ...DEFAULTS.notifySeverities } };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<InboxPrefs>;
    return {
      notifyIssueSuccess: Boolean(raw.notifyIssueSuccess ?? DEFAULTS.notifyIssueSuccess),
      notifyTypes: {
        ...DEFAULTS.notifyTypes,
        ...(raw.notifyTypes || {}),
      },
      notifySeverities: {
        ...DEFAULTS.notifySeverities,
        ...(raw.notifySeverities || {}),
      },
      deferredAutoEscalate: Boolean(raw.deferredAutoEscalate ?? DEFAULTS.deferredAutoEscalate),
    };
  } catch {
    return {
      ...DEFAULTS,
      notifyTypes: { ...DEFAULTS.notifyTypes },
      notifySeverities: { ...DEFAULTS.notifySeverities },
    };
  }
}

export function writeInboxPrefs(patch: Partial<InboxPrefs>): InboxPrefs {
  const current = readInboxPrefs();
  const next: InboxPrefs = {
    ...current,
    ...patch,
    notifyTypes: { ...current.notifyTypes, ...(patch.notifyTypes || {}) },
    notifySeverities: { ...current.notifySeverities, ...(patch.notifySeverities || {}) },
    deferredAutoEscalate:
      typeof patch.deferredAutoEscalate === 'boolean'
        ? patch.deferredAutoEscalate
        : current.deferredAutoEscalate,
  };
  const dir = join(homedir(), '.multi-agent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(prefsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/** issue 成功是否进 Inbox：env 覆盖 > 文件偏好 */
export function shouldNotifyIssueSuccess(): boolean {
  if (
    process.env.MA_INBOX_NOTIFY_SUCCESS === '1' ||
    process.env.MA_INBOX_NOTIFY_SUCCESS === 'true'
  ) {
    return true;
  }
  return readInboxPrefs().notifyIssueSuccess;
}
