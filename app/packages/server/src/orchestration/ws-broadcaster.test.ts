import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEvent } from '@ma/shared';
import { eventMatchesTopics, WsBroadcaster } from './ws-broadcaster';

function baseRun(overrides: Partial<{
  id: string;
  issueId: string | null;
  agentId: string;
}> = {}) {
  return {
    id: overrides.id ?? 'run-1',
    issueId: overrides.issueId === undefined ? 'iss-1' : overrides.issueId,
    agentId: overrides.agentId ?? 'agent-1',
    status: 'running' as const,
  };
}

const issueCreated: DomainEvent = {
  type: 'issue:created',
  issue: { id: 'iss-1' },
} as DomainEvent;

const issueUpdated: DomainEvent = {
  type: 'issue:updated',
  issue: { id: 'iss-2' },
  statusChanged: false,
  prevStatus: null,
} as DomainEvent;

const issueDeleted: DomainEvent = {
  type: 'issue:deleted',
  issueId: 'iss-3',
} as DomainEvent;

const commentCreated: DomainEvent = {
  type: 'comment:created',
  comment: { id: 'c-1', issueId: 'iss-9' },
} as DomainEvent;

const activityCreated: DomainEvent = {
  type: 'activity:created',
  issueId: 'iss-act',
  activity: {
    id: 'act-1',
    issueId: 'iss-act',
    actorType: 'system',
    actorName: '系统',
    eventType: 'status_changed',
    payload: { from: 'todo', to: 'done' },
    createdAt: new Date().toISOString(),
  },
};

const runQueued: DomainEvent = {
  type: 'run:queued',
  run: baseRun({ id: 'run-q', issueId: 'iss-1', agentId: 'agent-a' }),
} as DomainEvent;

const runProgress: DomainEvent = {
  type: 'run:progress',
  runId: 'run-s1',
  issueId: 'iss-1',
  text: 'working…',
};

const runStream: DomainEvent = {
  type: 'run:stream_chunk',
  runId: 'run-s1',
  kind: 'text',
  content: 'hi',
};

const runMessage: DomainEvent = {
  type: 'run:message',
  message: { id: 'm1', runId: 'run-s1', seq: 1, kind: 'assistant', body: 'x' },
  issueId: 'iss-1',
} as DomainEvent;

const runtimeEvent: DomainEvent = {
  type: 'runtime:event',
  event: {
    id: 're1',
    runId: 'run-s1',
    kind: 'tool_use',
    content: '',
    timestamp: new Date().toISOString(),
  },
};

const agentStatus: DomainEvent = {
  type: 'agent:status_changed',
  agentId: 'agent-a',
  status: 'working',
  activeRunCount: 1,
};

const inboxItem: DomainEvent = {
  type: 'inbox:item',
  item: { id: 'in-1' },
} as DomainEvent;

const wikiPage: DomainEvent = {
  type: 'wiki:page-created',
  slug: 'hello',
  title: 'Hello',
};

describe('eventMatchesTopics', () => {
  it('topics=null matches everything (legacy full fanout)', () => {
    expect(eventMatchesTopics(runProgress, null)).toBe(true);
    expect(eventMatchesTopics(issueCreated, null)).toBe(true);
    expect(eventMatchesTopics(wikiPage, null)).toBe(true);
  });

  it('S-tier stream only matches run: / run:{id}', () => {
    expect(eventMatchesTopics(runProgress, ['issue:', 'agent:', 'inbox:'])).toBe(false);
    expect(eventMatchesTopics(runStream, ['issue:iss-1'])).toBe(false);
    expect(eventMatchesTopics(runMessage, ['agent:agent-1'])).toBe(false);
    expect(eventMatchesTopics(runtimeEvent, ['inbox:', 'wiki:'])).toBe(false);

    expect(eventMatchesTopics(runProgress, ['run:'])).toBe(true);
    expect(eventMatchesTopics(runStream, ['run:run-s1'])).toBe(true);
    expect(eventMatchesTopics(runMessage, ['run:run-other'])).toBe(false);
    expect(eventMatchesTopics(runtimeEvent, ['run:run-s1'])).toBe(true);
  });

  it('L-tier run lifecycle matches run / issue / agent prefixes', () => {
    expect(eventMatchesTopics(runQueued, ['run:'])).toBe(true);
    expect(eventMatchesTopics(runQueued, ['run:run-q'])).toBe(true);
    expect(eventMatchesTopics(runQueued, ['issue:iss-1'])).toBe(true);
    expect(eventMatchesTopics(runQueued, ['issue:'])).toBe(true);
    expect(eventMatchesTopics(runQueued, ['agent:agent-a'])).toBe(true);
    expect(eventMatchesTopics(runQueued, ['agent:'])).toBe(true);
    expect(eventMatchesTopics(runQueued, ['inbox:', 'wiki:'])).toBe(false);
  });

  it('issue events match issue: / issue:{id}', () => {
    expect(eventMatchesTopics(issueCreated, ['issue:'])).toBe(true);
    expect(eventMatchesTopics(issueCreated, ['issue:iss-1'])).toBe(true);
    expect(eventMatchesTopics(issueUpdated, ['issue:iss-1'])).toBe(false);
    expect(eventMatchesTopics(issueUpdated, ['issue:iss-2'])).toBe(true);
    expect(eventMatchesTopics(issueDeleted, ['issue:iss-3'])).toBe(true);
    expect(eventMatchesTopics(issueDeleted, ['run:'])).toBe(false);
  });

  it('comment matches parent issue topic', () => {
    expect(eventMatchesTopics(commentCreated, ['issue:iss-9'])).toBe(true);
    expect(eventMatchesTopics(commentCreated, ['issue:'])).toBe(true);
    expect(eventMatchesTopics(commentCreated, ['issue:other'])).toBe(false);
  });

  it('activity:created matches parent issue topic (Slice 71)', () => {
    expect(eventMatchesTopics(activityCreated, ['issue:iss-act'])).toBe(true);
    expect(eventMatchesTopics(activityCreated, ['issue:'])).toBe(true);
    expect(eventMatchesTopics(activityCreated, ['issue:other'])).toBe(false);
    expect(eventMatchesTopics(activityCreated, ['run:'])).toBe(false);
  });

  it('agent / inbox / wiki prefixes', () => {
    expect(eventMatchesTopics(agentStatus, ['agent:'])).toBe(true);
    expect(eventMatchesTopics(agentStatus, ['agent:agent-a'])).toBe(true);
    expect(eventMatchesTopics(agentStatus, ['agent:other'])).toBe(false);
    expect(eventMatchesTopics(inboxItem, ['inbox:'])).toBe(true);
    expect(eventMatchesTopics(inboxItem, ['issue:'])).toBe(false);
    expect(eventMatchesTopics(wikiPage, ['wiki:'])).toBe(true);
    expect(eventMatchesTopics(wikiPage, ['inbox:'])).toBe(false);
  });

  it('empty topics array matches nothing', () => {
    expect(eventMatchesTopics(issueCreated, [])).toBe(false);
    expect(eventMatchesTopics(runProgress, [])).toBe(false);
  });
});

describe('WsBroadcaster', () => {
  let broadcaster: WsBroadcaster;

  beforeEach(() => {
    broadcaster = new WsBroadcaster();
  });

  function mockWs() {
    return {
      readyState: 1,
      isAlive: true,
      topics: null as string[] | null,
      send: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn(),
    };
  }

  it('broadcasts to all open conns when topics=null', () => {
    const a = mockWs();
    const b = mockWs();
    broadcaster.add(a as never);
    broadcaster.add(b as never);
    broadcaster.broadcast(runProgress);
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).toHaveBeenCalledTimes(1);
  });

  it('filters by per-connection topics after setTopics', () => {
    const board = mockWs();
    const detail = mockWs();
    broadcaster.add(board as never);
    broadcaster.add(detail as never);
    broadcaster.setTopics(board as never, ['issue:', 'agent:', 'inbox:']);
    broadcaster.setTopics(detail as never, ['run:', 'issue:iss-1']);

    broadcaster.broadcast(runProgress);
    expect(board.send).not.toHaveBeenCalled();
    expect(detail.send).toHaveBeenCalledTimes(1);

    broadcaster.broadcast(issueCreated);
    expect(board.send).toHaveBeenCalledTimes(1);
    expect(detail.send).toHaveBeenCalledTimes(2);
  });

  it('setTopics is replace (not merge)', () => {
    const ws = mockWs();
    broadcaster.add(ws as never);
    broadcaster.setTopics(ws as never, ['run:', 'issue:']);
    expect(broadcaster.getTopics(ws as never)).toEqual(['run:', 'issue:']);
    broadcaster.setTopics(ws as never, ['inbox:']);
    expect(broadcaster.getTopics(ws as never)).toEqual(['inbox:']);
    broadcaster.setTopics(ws as never, null);
    expect(broadcaster.getTopics(ws as never)).toBeNull();
  });
});
