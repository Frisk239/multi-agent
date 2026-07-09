import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { Issue, Comment, DomainEvent } from '@ma/shared';

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
    };

    return () => {
      mounted = false;
      ws.close();
    };
  }, [qc, setStatus]);
}
