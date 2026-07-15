import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { Issue, Comment, AgentRun, RunMessage, DomainEvent } from '@ma/shared';

// spec §7.4：Zustand 管 WS 连接状态
interface WsState {
  status: 'connecting' | 'open' | 'closed';
  setStatus: (s: WsState['status']) => void;
}

export const useWsStore = create<WsState>((set) => ({
  status: 'connecting',
  setStatus: (s) => set({ status: s }),
}));

// S02：issue 列表 + 单条 issue + comments 幂等更新
export function useWsEvents() {
  const qc = useQueryClient();
  const setStatus = useWsStore((s) => s.setStatus);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001/ws');
    let mounted = true;

    ws.onopen = () => mounted && setStatus('open');
    ws.onclose = () => mounted && setStatus('closed');

    ws.onmessage = (ev) => {
      const event = JSON.parse(ev.data) as DomainEvent;

      if (event.type === 'issue:created' || event.type === 'issue:updated') {
        qc.setQueryData<Issue[]>(['issues'], (old) => {
          if (!old) return old;
          if (event.type === 'issue:created') {
            if (old.some((i) => i.id === event.issue.id)) return old;
            return [...old, event.issue];
          }
          return old.map((i) => (i.id === event.issue.id ? event.issue : i));
        });
        qc.setQueryData<Issue>(['issue', event.issue.id], event.issue);
      }

      if (event.type === 'comment:created') {
        const { comment } = event;
        qc.setQueryData<Comment[]>(['comments', comment.issueId], (old) => {
          if (!old) return [comment];
          if (old.some((c) => c.id === comment.id)) return old;
          return [...old, comment];
        });
      }

      // S03 run 生命周期：更新 ['runs', issueId] cache
      if (
        event.type === 'run:queued' ||
        event.type === 'run:running' ||
        event.type === 'run:completed' ||
        event.type === 'run:failed' ||
        event.type === 'run:cancelled'
      ) {
        const run: AgentRun = event.run;
        qc.setQueryData<AgentRun[]>(['runs', run.issueId], (old) => {
          if (!old) return [run];
          const i = old.findIndex((r) => r.id === run.id);
          if (i >= 0) {
            const next = old.slice();
            next[i] = run;
            return next;
          }
          return [run, ...old];
        });
      }

      // S03 run:message：按 id 幂等插入 ['run-messages', runId]（spec D12 禁止乐观插，等 WS）
      if (event.type === 'run:message') {
        const { message }: { message: RunMessage } = event;
        qc.setQueryData<RunMessage[]>(['run-messages', message.runId], (old) => {
          if (!old) return [message];
          if (old.some((m) => m.id === message.id)) return old;
          return [...old, message].sort((a, b) => a.seq - b.seq);
        });
      }

      // S03 run:progress：fire-and-forget，不进 DB 也不进 cache（刷新即丢失，正常）
    };

    return () => {
      mounted = false;
      ws.close();
    };
  }, [qc, setStatus]);
}
