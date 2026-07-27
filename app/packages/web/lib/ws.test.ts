import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./toast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

// next/navigation 在 unit 中不跑 hook 路径；纯函数不依赖它
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

import {
  useWsStore,
  useRunProgressStore,
  topicsForPath,
  invalidateForPath,
} from './ws';

describe('ws Zustand stores', () => {
  beforeEach(() => {
    useWsStore.setState({ status: 'connecting' });
    useRunProgressStore.setState({
      byRunId: {},
      toolByRunId: {},
      partialByRunId: {},
      streamChunks: {},
    });
  });

  describe('useWsStore', () => {
    it('initializes with status connecting', () => {
      expect(useWsStore.getState().status).toBe('connecting');
    });

    it('updates status via setStatus', () => {
      useWsStore.getState().setStatus('open');
      expect(useWsStore.getState().status).toBe('open');

      useWsStore.getState().setStatus('closed');
      expect(useWsStore.getState().status).toBe('closed');
    });
  });

  describe('useRunProgressStore', () => {
    it('sets progress text truncated to 400 characters', () => {
      const runId = 'run-1';
      const longText = 'a'.repeat(500);

      useRunProgressStore.getState().setProgress(runId, longText);
      expect(useRunProgressStore.getState().byRunId[runId].length).toBe(400);
    });

    it('sets current active tool name truncated to 80 characters', () => {
      const runId = 'run-1';
      const toolName = 'very_long_tool_name_'.repeat(10);

      useRunProgressStore.getState().setTool(runId, toolName);
      expect(useRunProgressStore.getState().toolByRunId[runId].length).toBe(80);
    });

    it('appends partial assistant text correctly', () => {
      const runId = 'run-1';

      useRunProgressStore.getState().appendPartial(runId, 'First chunk');
      expect(useRunProgressStore.getState().partialByRunId[runId]).toBe('First chunk');

      useRunProgressStore.getState().appendPartial(runId, 'Second chunk');
      expect(useRunProgressStore.getState().partialByRunId[runId]).toBe('First chunk\n\nSecond chunk');
    });

    it('clears progress for a runId', () => {
      const runId = 'run-1';
      useRunProgressStore.getState().setProgress(runId, 'progress text');
      useRunProgressStore.getState().setTool(runId, 'read_file');
      useRunProgressStore.getState().appendPartial(runId, 'partial text');

      useRunProgressStore.getState().clearProgress(runId);

      expect(useRunProgressStore.getState().byRunId[runId]).toBeUndefined();
      expect(useRunProgressStore.getState().toolByRunId[runId]).toBeUndefined();
      expect(useRunProgressStore.getState().partialByRunId[runId]).toBeUndefined();
    });
  });
});

describe('topicsForPath (Slice 26)', () => {
  it('board / issues list: lifecycle issue/agent/inbox, no run:', () => {
    for (const p of ['/', '/issues', '/my-issues', '/agents', '/settings']) {
      const topics = topicsForPath(p);
      expect(topics).toContain('issue:');
      expect(topics).toContain('agent:');
      expect(topics).toContain('inbox:');
      expect(topics).not.toContain('run:');
    }
  });

  it('issue detail: issue:{id} + run:', () => {
    const topics = topicsForPath('/issues/iss-42');
    expect(topics).toContain('issue:iss-42');
    expect(topics).toContain('run:');
    expect(topics).toContain('agent:');
  });

  it('runs list and run detail include run:', () => {
    expect(topicsForPath('/runs')).toContain('run:');
    const detail = topicsForPath('/runs/run-9');
    expect(detail).toContain('run:');
    expect(detail).toContain('run:run-9');
  });

  it('chat includes run:', () => {
    expect(topicsForPath('/chat')).toContain('run:');
    expect(topicsForPath('/chat/thread-1')).toContain('run:');
  });

  it('wiki: wiki: + inbox:', () => {
    const topics = topicsForPath('/wiki');
    expect(topics).toEqual(expect.arrayContaining(['wiki:', 'inbox:']));
    expect(topics).not.toContain('run:');
  });

  it('agent detail keeps agent topics', () => {
    const topics = topicsForPath('/agents/agent-x');
    expect(topics).toContain('agent:');
    expect(topics).toContain('agent:agent-x');
  });
});

describe('invalidateForPath (Slice 26)', () => {
  function hasKey(keys: string[][], prefix: string[]): boolean {
    return keys.some(
      (k) =>
        k.length >= prefix.length &&
        prefix.every((p, i) => k[i] === p),
    );
  }

  it('always includes runs-active-count and inbox-unread', () => {
    for (const p of ['/', '/issues/iss-1', '/runs', '/wiki', '/chat', '/agents']) {
      const keys = invalidateForPath(p);
      expect(hasKey(keys, ['runs-active-count'])).toBe(true);
      expect(hasKey(keys, ['inbox-unread'])).toBe(true);
    }
  });

  it('board does not force fixed issues+agents+runs+runs-active four-pack only; no blind runs list', () => {
    const keys = invalidateForPath('/');
    expect(hasKey(keys, ['issues'])).toBe(true);
    expect(hasKey(keys, ['agents'])).toBe(true);
    // 不再固定刷 ['runs'] 四件套中的 runs 列表
    expect(hasKey(keys, ['runs'])).toBe(false);
  });

  it('issue detail invalidates issue + comments + runs for id', () => {
    const keys = invalidateForPath('/issues/iss-7');
    expect(hasKey(keys, ['issue', 'iss-7'])).toBe(true);
    expect(hasKey(keys, ['comments', 'iss-7'])).toBe(true);
    expect(hasKey(keys, ['runs', 'iss-7'])).toBe(true);
  });

  it('run detail invalidates run-scoped keys', () => {
    const keys = invalidateForPath('/runs/run-3');
    expect(hasKey(keys, ['run', 'run-3'])).toBe(true);
    expect(hasKey(keys, ['run-messages', 'run-3'])).toBe(true);
    expect(hasKey(keys, ['runs'])).toBe(true);
  });

  it('wiki invalidates wiki pages/jobs', () => {
    const keys = invalidateForPath('/wiki');
    expect(hasKey(keys, ['wiki-pages'])).toBe(true);
    expect(hasKey(keys, ['wiki-jobs'])).toBe(true);
  });

  it('chat invalidates chat threads/messages', () => {
    const keys = invalidateForPath('/chat');
    expect(hasKey(keys, ['chat-threads'])).toBe(true);
    expect(hasKey(keys, ['chat-messages'])).toBe(true);
  });
});
