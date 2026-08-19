'use client';

import { useMemo } from 'react';
import { classifyRunFailure, type AgentRun, type RunMessage } from '@ma/shared';
import { useRunMessages, useWorkspaceRuns } from './api';
import { useRunProgressStore } from './ws';

export function selectChatRuns(runs: AgentRun[]) {
  const liveRun =
    runs.find((run) => run.status === 'queued' || run.status === 'running') ?? null;
  const failedRun = liveRun
    ? null
    : runs.find(
        (run) =>
          run.status === 'failed' ||
          run.status === 'cancelled' ||
          run.status === 'timed_out',
      ) ?? null;
  return { liveRun, failedRun };
}

export function deriveChatTrace(messages: RunMessage[]) {
  let tool: string | undefined;
  const assistantParts: string[] = [];
  for (const message of messages) {
    if (message.kind === 'tool_start') {
      try {
        const payload = JSON.parse(message.body) as { name?: string };
        if (payload.name?.trim()) tool = payload.name.trim();
      } catch {
        if (message.body.trim()) tool = message.body.trim().slice(0, 80);
      }
    }
    if (message.kind === 'assistant' && message.body.trim()) {
      assistantParts.push(message.body.trim());
    }
  }
  return {
    tool,
    partial: assistantParts.length ? assistantParts.join('\n\n') : undefined,
  };
}

export function useChatLiveState(threadId: string | undefined) {
  const { data: runs = [] } = useWorkspaceRuns({
    chatThreadId: threadId,
    kind: 'chat',
    limit: 20,
    enabled: Boolean(threadId),
    refetchIntervalMs: 2500,
  });
  const { liveRun, failedRun } = useMemo(() => selectChatRuns(runs), [runs]);
  const { data: trace = [] } = useRunMessages(liveRun?.id, {
    refetchIntervalMs: liveRun ? 2000 : false,
  });
  const progress = useRunProgressStore((state) =>
    liveRun ? state.byRunId[liveRun.id]?.trim() : undefined,
  );
  const wsTool = useRunProgressStore((state) =>
    liveRun ? state.toolByRunId[liveRun.id]?.trim() : undefined,
  );
  const wsPartial = useRunProgressStore((state) =>
    liveRun ? state.partialByRunId[liveRun.id]?.trim() : undefined,
  );
  const fromTrace = useMemo(() => deriveChatTrace(trace), [trace]);

  const failure = failedRun
    ? failedRun.status === 'cancelled' && !(failedRun.error ?? '').trim()
      ? {
          code: 'generic' as const,
          title: '运行已取消',
          hint: '可用同一条用户消息再开一轮。',
          settingsHref: null as string | null,
        }
      : classifyRunFailure(failedRun.error, failedRun.failureReason)
    : null;

  return {
    liveRun,
    failedRun,
    failure,
    progress:
      liveRun?.status === 'queued' || liveRun?.status === 'running'
        ? progress
        : undefined,
    tool:
      liveRun?.status === 'running' ? wsTool || fromTrace.tool : undefined,
    partial:
      liveRun?.status === 'running' ? wsPartial || fromTrace.partial : undefined,
  };
}
