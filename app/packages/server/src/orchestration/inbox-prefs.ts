// P2-B：Inbox 通知偏好（~/.multi-agent/inbox-prefs.json）
// env MA_INBOX_NOTIFY_SUCCESS=1 仍强制开启 issue 成功推送。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type InboxPrefs = {
  /** 是否推送 issue run completed（默认 false，F10 降噪） */
  notifyIssueSuccess: boolean;
};

const DEFAULTS: InboxPrefs = {
  notifyIssueSuccess: false,
};

function prefsPath(): string {
  return join(homedir(), '.multi-agent', 'inbox-prefs.json');
}

export function readInboxPrefs(): InboxPrefs {
  const p = prefsPath();
  if (!existsSync(p)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<InboxPrefs>;
    return {
      notifyIssueSuccess: Boolean(raw.notifyIssueSuccess),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeInboxPrefs(patch: Partial<InboxPrefs>): InboxPrefs {
  const next = { ...readInboxPrefs(), ...patch };
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
