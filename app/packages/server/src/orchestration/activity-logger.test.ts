/**
 * Slice 71 · recordActivityLog 成功 insert 后广播 activity:created
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityCreatedEvent } from '@ma/shared';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  insertRun: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  db: {
    insert: (...args: unknown[]) => mocks.insertValues(...args),
  },
}));

vi.mock('../db/schema.js', () => ({
  activityLogs: { __table: 'activity_logs' },
}));

vi.mock('./event-bus.js', () => ({
  eventBus: {
    publish: (...args: unknown[]) => mocks.publish(...args),
  },
}));

import { recordActivityLog } from './activity-logger.js';

describe('recordActivityLog (Slice 71)', () => {
  beforeEach(() => {
    mocks.publish.mockReset();
    mocks.insertRun.mockReset();
    mocks.insertValues.mockReset();
    mocks.insertRun.mockReturnValue(undefined);
    mocks.insertValues.mockReturnValue({
      values: (row: unknown) => ({
        run: () => {
          mocks.insertRun(row);
        },
      }),
    });
  });

  it('inserts row then publishes activity:created with issueId + activity', () => {
    recordActivityLog({
      issueId: 'iss-71',
      eventType: 'status_changed',
      payload: { from: 'todo', to: 'in_progress' },
      actorName: '测试员',
      actorType: 'member',
      actorId: 'm1',
    });

    expect(mocks.insertRun).toHaveBeenCalledTimes(1);
    const row = mocks.insertRun.mock.calls[0][0] as {
      id: string;
      issueId: string;
      eventType: string;
      payload: string | null;
      actorName: string;
    };
    expect(row.issueId).toBe('iss-71');
    expect(row.eventType).toBe('status_changed');
    expect(row.actorName).toBe('测试员');
    expect(JSON.parse(row.payload!)).toEqual({ from: 'todo', to: 'in_progress' });

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    const ev = mocks.publish.mock.calls[0][0];
    expect(ev.type).toBe('activity:created');
    expect(ev.issueId).toBe('iss-71');
    expect(ev.activity.id).toBe(row.id);
    expect(ev.activity.issueId).toBe('iss-71');
    expect(ev.activity.eventType).toBe('status_changed');
    expect(ev.activity.payload).toEqual({ from: 'todo', to: 'in_progress' });
    expect(typeof ev.activity.createdAt).toBe('string');

    const parsed = ActivityCreatedEvent.safeParse(ev);
    expect(parsed.success).toBe(true);
  });

  it('does not publish when insert throws', () => {
    mocks.insertValues.mockReturnValue({
      values: () => ({
        run: () => {
          throw new Error('db down');
        },
      }),
    });

    recordActivityLog({
      issueId: 'iss-x',
      eventType: 'run_started',
      payload: { runId: 'run-1' },
    });

    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
