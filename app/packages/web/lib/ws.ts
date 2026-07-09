import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { Issue, DomainEvent } from '@ma/shared';

// spec §7.4：Zustand 管 WS 连接状态
interface WsState {
  status: 'connecting' | 'open' | 'closed';
  setStatus: (s: WsState['status']) => void;
}

export const useWsStore = create<WsState>((set) => ({
  status: 'connecting',
  setStatus: (s) => set({ status: s }),
}));

// spec §6.6 + §7.5 R4：WS 广播含发起者，事件处理必须幂等
// setQueryData 天然幂等（写相同值不触发重渲染）
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
      // 幂等：用 issue id 更新 cache，相同状态不触发重渲染
      qc.setQueryData<Issue[]>(['issues'], (old) => {
        if (!old) return old;
        if (event.type === 'issue:created') {
          // 避免重复添加（幂等）
          if (old.some((i) => i.id === event.issue.id)) return old;
          return [...old, event.issue];
        }
        if (event.type === 'issue:updated') {
          return old.map((i) => (i.id === event.issue.id ? event.issue : i));
        }
        return old;
      });
    };

    return () => {
      mounted = false;
      ws.close();
    };
  }, [qc, setStatus]);
}
