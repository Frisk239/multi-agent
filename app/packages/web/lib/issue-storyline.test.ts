import { describe, it, expect } from 'vitest';
import type { ActivityLog, AgentRun, Comment } from '@ma/shared';
import { mergeIssueStoryline, mergeIssueStorylineFrom } from './issue-storyline';

function comment(partial: Partial<Comment> & Pick<Comment, 'id' | 'createdAt'>): Comment {
  return {
    issueId: 'iss-1',
    type: 'comment',
    authorType: 'member',
    authorId: 'u-1',
    authorLabel: 'Me',
    body: 'hello',
    ...partial,
  };
}

function activity(
  partial: Partial<ActivityLog> & Pick<ActivityLog, 'id' | 'createdAt' | 'eventType'>,
): ActivityLog {
  return {
    issueId: 'iss-1',
    actorType: 'member',
    actorName: 'Me',
    payload: null,
    ...partial,
  };
}

function run(
  partial: Partial<AgentRun> & Pick<AgentRun, 'id' | 'createdAt' | 'status'>,
): AgentRun {
  return {
    issueId: 'iss-1',
    agentId: 'ag-1',
    runtime: 'claude-code',
    kind: 'issue',
    quickPrompt: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
    isLeader: false,
    squadId: null,
    ...partial,
  };
}

describe('mergeIssueStoryline', () => {
  it('merges comments, activities, runs sorted by createdAt ascending', () => {
    const comments = [
      comment({ id: 'c-2', createdAt: '2026-07-01T02:00:00.000Z', body: 'later' }),
      comment({ id: 'c-1', createdAt: '2026-07-01T00:00:00.000Z', body: 'first' }),
    ];
    const activities = [
      activity({
        id: 'a-1',
        createdAt: '2026-07-01T01:00:00.000Z',
        eventType: 'status_changed',
        payload: { from: 'todo', to: 'in_progress' },
      }),
    ];
    const runs = [
      run({
        id: 'run-1',
        createdAt: '2026-07-01T01:30:00.000Z',
        status: 'running',
      }),
    ];

    const items = mergeIssueStoryline(comments, activities, runs);
    expect(items.map((i) => i.id)).toEqual(['c-1', 'a-1', 'run-1', 'c-2']);
    expect(items.map((i) => i.kind)).toEqual([
      'comment',
      'activity',
      'run',
      'comment',
    ]);
  });

  it('skips comment_created activity when linked comment is present', () => {
    const comments = [
      comment({ id: 'c-dup', createdAt: '2026-07-01T00:00:00.000Z' }),
    ];
    const activities = [
      activity({
        id: 'a-dup',
        createdAt: '2026-07-01T00:00:01.000Z',
        eventType: 'comment_created',
        payload: { commentId: 'c-dup' },
      }),
      activity({
        id: 'a-keep',
        createdAt: '2026-07-01T00:00:02.000Z',
        eventType: 'status_changed',
        payload: { from: 'todo', to: 'done' },
      }),
    ];

    const items = mergeIssueStoryline(comments, activities);
    expect(items.map((i) => i.id)).toEqual(['c-dup', 'a-keep']);
    expect(items.some((i) => i.id === 'a-dup')).toBe(false);
  });

  it('keeps comment_created activity when comment is missing', () => {
    const activities = [
      activity({
        id: 'a-orphan',
        createdAt: '2026-07-01T00:00:00.000Z',
        eventType: 'comment_created',
        payload: { commentId: 'missing' },
      }),
    ];
    const items = mergeIssueStoryline([], activities);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'activity', id: 'a-orphan' });
  });

  it('skips run_* activity when matching run row is present', () => {
    const runs = [
      run({
        id: 'run-1',
        createdAt: '2026-07-01T01:00:00.000Z',
        status: 'failed',
        error: 'timeout',
      }),
    ];
    const activities = [
      activity({
        id: 'a-run-started',
        createdAt: '2026-07-01T01:00:00.000Z',
        eventType: 'run_started',
        payload: { runId: 'run-1' },
      }),
      activity({
        id: 'a-run-failed',
        createdAt: '2026-07-01T01:05:00.000Z',
        eventType: 'run_failed',
        payload: { run_id: 'run-1', error: 'timeout' },
      }),
      activity({
        id: 'a-status',
        createdAt: '2026-07-01T01:06:00.000Z',
        eventType: 'status_changed',
        payload: { from: 'in_progress', to: 'todo' },
      }),
    ];

    const items = mergeIssueStoryline([], activities, runs);
    expect(items.map((i) => i.id)).toEqual(['run-1', 'a-status']);
    expect(items.some((i) => i.kind === 'activity' && i.id.startsWith('a-run'))).toBe(false);
  });

  it('keeps run_* activity when run row is absent', () => {
    const activities = [
      activity({
        id: 'a-orphan-run',
        createdAt: '2026-07-01T01:00:00.000Z',
        eventType: 'run_completed',
        payload: { runId: 'run-missing' },
      }),
    ];
    const items = mergeIssueStoryline([], activities, []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'activity', id: 'a-orphan-run' });
  });

  it('handles empty / null inputs', () => {
    expect(mergeIssueStoryline(null, undefined, null)).toEqual([]);
    expect(mergeIssueStorylineFrom({})).toEqual([]);
  });

  it('dedupes same comment id', () => {
    const c = comment({ id: 'c-1', createdAt: '2026-07-01T00:00:00.000Z' });
    const items = mergeIssueStoryline([c, c], []);
    expect(items).toHaveLength(1);
  });

  it('run payload carries status for drawer anchor', () => {
    const items = mergeIssueStoryline(
      [],
      [],
      [
        run({
          id: 'run-x',
          createdAt: '2026-07-01T00:00:00.000Z',
          status: 'failed',
          error: 'boom',
        }),
      ],
    );
    expect(items[0]).toMatchObject({
      kind: 'run',
      id: 'run-x',
      payload: { runId: 'run-x', status: 'failed', error: 'boom' },
    });
  });
});
