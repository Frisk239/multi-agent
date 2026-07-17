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

// S12：run:progress 短时状态（仅最后一条 / runId，不进 RQ）
interface RunProgressState {
  byRunId: Record<string, string>;
  setProgress: (runId: string, text: string) => void;
  clearProgress: (runId: string) => void;
}

export const useRunProgressStore = create<RunProgressState>((set) => ({
  byRunId: {},
  setProgress: (runId, text) =>
    set((s) => ({
      byRunId: { ...s.byRunId, [runId]: text.slice(0, 200) },
    })),
  clearProgress: (runId) =>
    set((s) => {
      if (!(runId in s.byRunId)) return s;
      const next = { ...s.byRunId };
      delete next[runId];
      return { byRunId: next };
    }),
}));

// S02：issue 列表 + 单条 issue + comments 幂等更新
export function useWsEvents() {
  const qc = useQueryClient();
  const setStatus = useWsStore((s) => s.setStatus);
  const setProgress = useRunProgressStore((s) => s.setProgress);
  const clearProgress = useRunProgressStore((s) => s.clearProgress);

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
        // B4：issue:created 不预填 ['issue', id]（避免详情半残 cache）；updated 仍同步单条
        if (event.type === 'issue:updated') {
          qc.setQueryData<Issue>(['issue', event.issue.id], event.issue);
        }
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
        if (
          event.type === 'run:completed' ||
          event.type === 'run:failed' ||
          event.type === 'run:cancelled'
        ) {
          clearProgress(run.id);
        }
        // bu01：run 终态可能伴随 inbox 写入，invalidate 角标/列表
        if (event.type === 'run:completed' || event.type === 'run:failed') {
          qc.invalidateQueries({ queryKey: ['inbox'] });
          qc.invalidateQueries({ queryKey: ['inbox-unread'] });
        }
      }

      // bu01：真 Inbox 新通知
      if (event.type === 'inbox:item') {
        qc.invalidateQueries({ queryKey: ['inbox'] });
        qc.invalidateQueries({ queryKey: ['inbox-unread'] });
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

      // S12 run:progress：仅前端短时 map，截断 200
      if (event.type === 'run:progress') {
        setProgress(event.runId, event.text);
      }

      // S06 wiki:page-created：invalidate wiki 列表 cache（spec §7.2）
      // WS 事件由 server 的 ingest pipeline → eventBus → wsBroadcaster 自动广播到前端
      // 用 invalidateQueries 而非 setQueryData：新页 content 要从文件系统 GET，
      // 前端无法凭 WS 事件里的 slug+title 构造完整页
      if (event.type === 'wiki:page-created') {
        qc.invalidateQueries({ queryKey: ['wiki-pages'] });
      }
    };

    return () => {
      mounted = false;
      ws.close();
    };
  }, [qc, setStatus, setProgress, clearProgress]);
}
