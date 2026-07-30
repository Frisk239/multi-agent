import { describe, expect, it } from 'vitest';
import type { AgentRun, RunMessage } from '@ma/shared';
import { deriveChatTrace, selectChatRuns } from './chat-live-state';

const run = (id: string, status: AgentRun['status']): AgentRun =>
  ({ id, status } as AgentRun);

describe('chat live state projections', () => {
  it('selects only the active thread run and suppresses stale failures while active', () => {
    expect(
      selectChatRuns([run('live', 'running'), run('old', 'failed')]),
    ).toEqual({ liveRun: run('live', 'running'), failedRun: null });
  });

  it('selects the latest terminal failure when no run is active', () => {
    expect(selectChatRuns([run('failed', 'failed'), run('done', 'completed')]))
      .toEqual({ liveRun: null, failedRun: run('failed', 'failed') });
  });

  it('derives the latest tool and assistant partial from durable trace', () => {
    const messages = [
      { kind: 'tool_start', body: '{"name":"read_file"}' },
      { kind: 'assistant', body: '第一段' },
      { kind: 'assistant', body: '第二段' },
    ] as RunMessage[];
    expect(deriveChatTrace(messages)).toEqual({
      tool: 'read_file',
      partial: '第一段\n\n第二段',
    });
  });
});
