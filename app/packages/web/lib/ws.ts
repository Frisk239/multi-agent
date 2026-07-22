import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { Issue, Comment, AgentRun, RunMessage, DomainEvent } from '@ma/shared';
import { classifyRunFailure } from '@ma/shared';
import { toastError, toastSuccess } from './toast';

// spec §7.4：Zustand 管 WS 连接状态
interface WsState {
  status: 'connecting' | 'open' | 'closed';
  setStatus: (s: WsState['status']) => void;
}

export const useWsStore = create<WsState>((set) => ({
  status: 'connecting',
  setStatus: (s) => set({ status: s }),
}));

// S12 + D1：run 活过程短时状态（progress / 最近 tool / partial 助手文本；不进 RQ）
interface RunProgressState {
  byRunId: Record<string, string>;
  toolByRunId: Record<string, string>;
  /** running 时累积的 assistant 片段（run:message） */
  partialByRunId: Record<string, string>;
  setProgress: (runId: string, text: string) => void;
  setTool: (runId: string, toolName: string) => void;
  appendPartial: (runId: string, text: string) => void;
  clearProgress: (runId: string) => void;
}

export const useRunProgressStore = create<RunProgressState>((set) => ({
  byRunId: {},
  toolByRunId: {},
  partialByRunId: {},
  setProgress: (runId, text) =>
    set((s) => ({
      byRunId: { ...s.byRunId, [runId]: text.slice(0, 400) },
    })),
  setTool: (runId, toolName) =>
    set((s) => ({
      toolByRunId: { ...s.toolByRunId, [runId]: toolName.slice(0, 80) },
    })),
  appendPartial: (runId, text) =>
    set((s) => {
      const prev = s.partialByRunId[runId] ?? '';
      const t = text.trim();
      if (!t) return s;
      // 整段消息：扩展/替换；独立块：换行拼接（非 token 流）
      let next: string;
      if (!prev) next = t;
      else if (t.startsWith(prev) || prev.startsWith(t))
        next = t.length >= prev.length ? t : prev;
      else if (prev.includes(t)) next = prev;
      else next = `${prev}\n\n${t}`;
      return {
        partialByRunId: { ...s.partialByRunId, [runId]: next.slice(-2000) },
      };
    }),
  clearProgress: (runId) =>
    set((s) => {
      const byRunId = { ...s.byRunId };
      const toolByRunId = { ...s.toolByRunId };
      const partialByRunId = { ...s.partialByRunId };
      delete byRunId[runId];
      delete toolByRunId[runId];
      delete partialByRunId[runId];
      return { byRunId, toolByRunId, partialByRunId };
    }),
}));

// S02：issue 列表 + 单条 issue + comments 幂等更新
export function useWsEvents() {
  const qc = useQueryClient();
  const setStatus = useWsStore((s) => s.setStatus);
  const setProgress = useRunProgressStore((s) => s.setProgress);
  const setTool = useRunProgressStore((s) => s.setTool);
  const appendPartial = useRunProgressStore((s) => s.appendPartial);
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

      if (event.type === 'issue:deleted') {
        const { issueId, parentIssueId } = event;
        qc.setQueryData<Issue[]>(['issues'], (old) =>
          old?.filter((i) => i.id !== issueId),
        );
        qc.removeQueries({ queryKey: ['issue', issueId] });
        qc.removeQueries({ queryKey: ['comments', issueId] });
        if (parentIssueId) {
          qc.invalidateQueries({ queryKey: ['issue-children', parentIssueId] });
          qc.invalidateQueries({ queryKey: ['issue', parentIssueId] });
        }
        qc.invalidateQueries({ queryKey: ['issues'] });
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
        // bu03：quick_create 可无 issueId，跳过 issue-scoped runs cache
        if (run.issueId) {
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
        // agent Runs Tab（补2）
        qc.invalidateQueries({ queryKey: ['agent-runs', run.agentId] });
        // runs-active-nav：生命周期变化刷新在途角标 + 工作区 runs 列表
        qc.invalidateQueries({ queryKey: ['runs-active-count'] });
        qc.invalidateQueries({ queryKey: ['runs', 'workspace'] });
        qc.invalidateQueries({ queryKey: ['run', run.id] });
        // agent-chat：chat run 终态要刷会话消息（assistant 回写 / 失败态）
        if (run.kind === 'chat' && run.chatThreadId) {
          qc.invalidateQueries({ queryKey: ['chat-messages', run.chatThreadId] });
          qc.invalidateQueries({ queryKey: ['chat-threads'] });
        }
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
        // live-run-toast：终态轻提示 + 深链
        if (event.type === 'run:failed') {
          const cls = classifyRunFailure(run.error);
          toastError(
            cls.title + (run.error ? ` · ${run.error.slice(0, 80)}` : ''),
            {
              action: cls.settingsHref
                ? { label: '去处理', href: cls.settingsHref }
                : run.issueId
                  ? {
                      label: '打开 Issue',
                      href: `/issues/${run.issueId}#run-trace`,
                    }
                  : {
                      label: '运行列表',
                      href: `/runs?run=${encodeURIComponent(run.id)}&status=failed`,
                    },
              durationMs: 8000,
            },
          );
        } else if (event.type === 'run:completed') {
          toastSuccess(`运行完成 · ${run.id.slice(0, 8)}…`, {
            action: run.issueId
              ? { label: '打开 Issue', href: `/issues/${run.issueId}` }
              : {
                  label: '查看运行',
                  href: `/runs?run=${encodeURIComponent(run.id)}&status=completed`,
                },
            durationMs: 5000,
          });
        }
      }

      // bu01：真 Inbox 新通知
      if (event.type === 'inbox:item') {
        qc.invalidateQueries({ queryKey: ['inbox'] });
        qc.invalidateQueries({ queryKey: ['inbox-unread'] });
      }

      // S03 run:message：按 id 幂等插入 ['run-messages', runId]（spec D12 禁止乐观插，等 WS）
      // D1：tool_start → 最近工具名；assistant → partial 气泡
      if (event.type === 'run:message') {
        const { message }: { message: RunMessage } = event;
        qc.setQueryData<RunMessage[]>(['run-messages', message.runId], (old) => {
          if (!old) return [message];
          if (old.some((m) => m.id === message.id)) return old;
          return [...old, message].sort((a, b) => a.seq - b.seq);
        });
        if (message.kind === 'tool_start') {
          let name = 'tool';
          try {
            const j = JSON.parse(message.body) as { name?: string };
            if (j?.name?.trim()) name = j.name.trim();
          } catch {
            if (message.body.trim()) name = message.body.trim().slice(0, 80);
          }
          setTool(message.runId, name);
          setProgress(message.runId, `工具 · ${name}`);
        } else if (message.kind === 'tool_end') {
          let name = '';
          try {
            const j = JSON.parse(message.body) as { name?: string };
            if (j?.name?.trim()) name = j.name.trim();
          } catch {
            /* ignore */
          }
          setProgress(
            message.runId,
            name ? `工具完成 · ${name}` : '工具步骤完成',
          );
        } else if (message.kind === 'assistant' && message.body?.trim()) {
          appendPartial(message.runId, message.body);
        }
      }

      // S12 run:progress：仅前端短时 map
      if (event.type === 'run:progress') {
        setProgress(event.runId, event.text);
      }

      // S06 wiki:page-created：invalidate wiki 列表 cache（spec §7.2）
      // WS 事件由 server 的 ingest pipeline → eventBus → wsBroadcaster 自动广播到前端
      // 用 invalidateQueries 而非 setQueryData：新页 content 要从文件系统 GET，
      // 前端无法凭 WS 事件里的 slug+title 构造完整页
      if (event.type === 'wiki:page-created') {
        qc.invalidateQueries({ queryKey: ['wiki-pages'] });
        qc.invalidateQueries({ queryKey: ['wiki-jobs'] });
      }
    };

    return () => {
      mounted = false;
      ws.close();
    };
  }, [qc, setStatus, setProgress, setTool, appendPartial, clearProgress]);
}
