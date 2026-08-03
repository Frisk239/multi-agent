/**
 * G6-10：inbox 写失败可观测直测。
 * mock db 抛错 → notifyInbox 不 throw（执行路径不中断）+ 计数进
 * getInboxWriteFailures + logger.warn 可观测。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbThrow: false,
  publish: vi.fn(),
  loggerWarn: vi.fn(),
  showNotification: vi.fn(),
  readPrefs: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => {
      if (mocks.dbThrow) throw new Error('db down');
      return {
        from: () => ({
          where: () => ({
            // 一律返回假行：dedupe 假命中提前返回（无碍断言），写后查询不崩
            get: () => ({ id: 'inbox-1', issueId: 'iss-1', identifier: 'FRI-1', title: 't' }),
          }),
        }),
      };
    },
    insert: () => {
      if (mocks.dbThrow) throw new Error('db down');
      return {
        values: () => ({ run: () => {} }),
      };
    },
  },
}));

vi.mock('../db/schema.js', () => ({
  inboxItems: { id: 'id', recipientType: 'recipientType', recipientId: 'recipientId', dedupeKey: 'dedupeKey' },
  issueSubscribers: { issueId: 'issueId', userType: 'userType', userId: 'userId' },
  issues: {},
  agents: {},
  squads: {},
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...a: unknown[]) => a),
  eq: vi.fn((...a: unknown[]) => a),
}));

vi.mock('../db/reshape.js', () => ({
  toInboxItem: (row: unknown) => row as never,
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: (...args: unknown[]) => mocks.publish(...args) },
}));

vi.mock('./inbox-prefs.js', () => ({
  readInboxPrefs: () => mocks.readPrefs(),
  shouldNotifyIssueSuccess: () => false,
}));

vi.mock('./system-notify.js', () => ({
  showSystemNotification: (...args: unknown[]) => mocks.showNotification(...args),
}));

vi.mock('../logger.js', () => ({
  logger: { warn: (...args: unknown[]) => mocks.loggerWarn(...args) },
}));

import {
  notifyInbox,
  ensureIssueSubscriber,
  getInboxWriteFailures,
  resetInboxWriteFailures,
} from './inbox-writer.js';

const base = {
  type: 'comment' as const,
  severity: 'attention' as const,
  title: 't',
  issueId: 'iss-1',
  dedupeKey: 'k1',
};

describe('G6-10 inbox 写失败可观测', () => {
  beforeEach(() => {
    mocks.dbThrow = false;
    mocks.publish.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.showNotification.mockReset();
    mocks.readPrefs.mockReturnValue({ notifyTypes: {}, notifySeverities: {}, deferredAutoEscalate: false });
    resetInboxWriteFailures();
  });

  afterEach(() => resetInboxWriteFailures());

  it('写成功：不 throw、不计数、不 warn', () => {
    expect(() => notifyInbox(base)).not.toThrow();
    expect(getInboxWriteFailures()).toEqual({});
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it('写失败（db down）：不 throw、返回 null、计数 + warn（channel=type）', () => {
    mocks.dbThrow = true;
    expect(() => notifyInbox(base)).not.toThrow();
    const failures = getInboxWriteFailures();
    expect(failures.comment).toBe(1);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'comment' }),
      expect.stringContaining('写失败'),
    );
  });

  it('连续失败累积计数（同 channel）', () => {
    mocks.dbThrow = true;
    notifyInbox(base);
    notifyInbox(base);
    expect(getInboxWriteFailures().comment).toBe(2);
  });

  it('ensureIssueSubscriber 写失败同样降级 warn（channel=ensure_subscriber）', () => {
    mocks.dbThrow = true;
    expect(() => ensureIssueSubscriber('iss-1', 'member', 'm1', 'r')).not.toThrow();
    expect(getInboxWriteFailures().ensure_subscriber).toBe(1);
  });
});
