import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { Issue, Comment, ActivityLog, AgentRun, RunMessage, DomainEvent } from '@ma/shared';
import { classifyRunFailure } from '@ma/shared';
import { toastError, toastSuccess } from './toast';
import { withLocalTokenWsUrl } from './local-token';

// spec §7.4：Zustand 管 WS 连接状态
interface WsState {
  status: 'connecting' | 'open' | 'closed';
  setStatus: (s: WsState['status']) => void;
}

export const useWsStore = create<WsState>((set) => ({
  status: 'connecting',
  setStatus: (s) => set({ status: s }),
}));

// M4b：WS 地址从 NEXT_PUBLIC_API_URL 推导（host:port 一致，http→ws），
// 避免「API 指向 3011 但 WS 仍连默认 3001」的配置不一致（e2e/自部署摩擦）。
// NEXT_PUBLIC_WS_URL 显式设置时优先（兼容既有配置）。
export function deriveWsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) {
    const u = new URL(api, 'http://localhost:3001');
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws';
    u.search = '';
    return u.toString();
  }
  return 'ws://localhost:3001/ws';
}

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
  streamChunks: Record<string, string>;
  appendStreamChunk: (runId: string, text: string) => void;
}

export const useRunProgressStore = create<RunProgressState>((set) => ({
  byRunId: {},
  toolByRunId: {},
  partialByRunId: {},
  streamChunks: {},
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
  appendStreamChunk: (runId, text) =>
    set((s) => ({
      streamChunks: { ...s.streamChunks, [runId]: (s.streamChunks[runId] || '') + text },
    })),
  clearProgress: (runId) =>
    set((s) => {
      const byRunId = { ...s.byRunId };
      const toolByRunId = { ...s.toolByRunId };
      const partialByRunId = { ...s.partialByRunId };
      const streamChunks = { ...s.streamChunks };
      delete byRunId[runId];
      delete toolByRunId[runId];
      delete partialByRunId[runId];
      delete streamChunks[runId];
      return { byRunId, toolByRunId, partialByRunId, streamChunks };
    }),
}));

// —— Slice 26：pathname → topics / 重连 invalidate（纯函数，可单测）——

/** 全局默认：lifecycle 级 issue/agent/inbox；不含 run: stream（看板靠 agent:status + 重连） */
const DEFAULT_LIFECYCLE_TOPICS = ['issue:', 'agent:', 'inbox:'] as const;

/**
 * 按当前路由决定 WS 订阅全集（replace）。
 * - board / my-issues / agents 等：issue/agent/inbox（无 run:，不收 S 档 stream）
 * - issue 详情：issue:{id} + run:（lifecycle via issue/run；stream via run:）
 * - runs / chat：含 run:
 * - wiki：wiki: + inbox:
 */
export function topicsForPath(pathname: string | null | undefined): string[] {
  const path = (pathname ?? '/').split('?')[0] || '/';
  const parts = path.split('/').filter(Boolean);
  const head = parts[0] ?? '';
  const id = parts[1];

  // 详情 / 流页
  if (head === 'issues' && id) {
    return [`issue:${id}`, 'run:', 'agent:', 'inbox:'];
  }
  if (head === 'runs') {
    // /runs 与 /runs/[id]
    return id
      ? [`run:${id}`, 'run:', 'issue:', 'agent:', 'inbox:']
      : ['run:', 'issue:', 'agent:', 'inbox:'];
  }
  if (head === 'chat') {
    return ['run:', 'agent:', 'inbox:', 'issue:'];
  }
  if (head === 'wiki') {
    return ['wiki:', 'inbox:'];
  }
  if (head === 'automation') {
    return ['automation:', 'issue:', 'run:', 'agent:', 'inbox:'];
  }
  if (head === 'agents' && id) {
    return ['agent:', `agent:${id}`, 'inbox:', 'issue:'];
  }
  if (head === 'inbox') {
    return ['inbox:', 'issue:', 'agent:'];
  }

  // 看板 / 列表 / 其它：lifecycle 默认，不订 run:（S 档不进板）
  // `/` `/issues` `/my-issues` `/agents` `/settings` …
  return [...DEFAULT_LIFECYCLE_TOPICS];
}

/**
 * 重连时按 pathname 选择 invalidate 的 queryKey 前缀列表。
 * 全局始终含 runs-active-count + inbox-unread。
 */
export function invalidateForPath(pathname: string | null | undefined): string[][] {
  const path = (pathname ?? '/').split('?')[0] || '/';
  const parts = path.split('/').filter(Boolean);
  const head = parts[0] ?? '';
  const id = parts[1];

  const keys: string[][] = [
    ['runs-active-count'],
    ['inbox-unread'],
  ];

  if (head === 'issues' && id) {
    keys.push(
      ['issue', id],
      ['comments', id],
      ['activities', id],
      ['runs', id],
      ['issues'],
    );
    return keys;
  }
  if (head === 'runs') {
    keys.push(['runs'], ['runs', 'workspace']);
    if (id) keys.push(['run', id], ['run-messages', id], ['run-tree', id]);
    return keys;
  }
  if (head === 'chat') {
    keys.push(['chat-threads'], ['chat-messages'], ['runs-active-count']);
    return keys;
  }
  if (head === 'wiki') {
    keys.push(['wiki-pages'], ['wiki-jobs'], ['wiki-page'], ['wiki-health']);
    return keys;
  }
  if (head === 'agents') {
    keys.push(['agents'], ['agents-readiness']);
    if (id) keys.push(['agent', id], ['agent-runs', id], ['agent-readiness']);
    return keys;
  }
  if (head === 'inbox') {
    keys.push(['inbox']);
    return keys;
  }
  if (head === 'my-issues') {
    keys.push(['issues'], ['agents']);
    return keys;
  }
  if (head === 'issues' || head === '' || path === '/') {
    keys.push(['issues'], ['agents']);
    return keys;
  }
  if (head === 'squads') {
    keys.push(['squads'], ['agents']);
    return keys;
  }
  if (head === 'projects') {
    keys.push(['projects'], ['issues']);
    return keys;
  }
  if (head === 'automation') {
    keys.push(['automation-rules'], ['automation-runs']);
    return keys;
  }
  if (head === 'memory') {
    keys.push(['memory'], ['memory-status']);
    return keys;
  }
  if (head === 'settings') {
    keys.push(['settings-status'], ['settings-diagnostics'], ['runtimes']);
    return keys;
  }

  // 未知路由：保守刷 issues + agents（仍不刷 runs 四件套）
  keys.push(['issues'], ['agents']);
  return keys;
}

function sendSubscribe(ws: WebSocket, topics: string[]): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'subscribe', topics }));
}

function applyInvalidateKeys(qc: QueryClient, keys: string[][]): void {
  for (const queryKey of keys) {
    qc.invalidateQueries({ queryKey });
  }
}

// S02：issue 列表 + 单条 issue + comments 幂等更新
export function useWsEvents() {
  const qc = useQueryClient();
  const pathname = usePathname();
  const setStatus = useWsStore((s) => s.setStatus);
  const setProgress = useRunProgressStore((s) => s.setProgress);
  const setTool = useRunProgressStore((s) => s.setTool);
  const appendPartial = useRunProgressStore((s) => s.appendPartial);
  const appendStreamChunk = useRunProgressStore((s) => s.appendStreamChunk);
  const clearProgress = useRunProgressStore((s) => s.clearProgress);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const wsRef = useRef<WebSocket | null>(null);

  // 路由变化 → replace 订阅
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    sendSubscribe(ws, topicsForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    let ws: WebSocket;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (!mounted) return;
      // Slice 59：有 NEXT_PUBLIC_MA_LOCAL_TOKEN 时追加 ?token=（浏览器 WS 无法自定义 header）
      const wsBase = deriveWsBase();
      ws = new WebSocket(withLocalTokenWsUrl(wsBase));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        setStatus('open');
        // Slice 26：open 后按当前 pathname subscribe
        sendSubscribe(ws, topicsForPath(pathnameRef.current));
        if (retryCount > 0) {
          // 重连：按页 invalidate，全局角标始终刷
          applyInvalidateKeys(qc, invalidateForPath(pathnameRef.current));
        }
        retryCount = 0;
      };

      ws.onclose = () => {
        if (!mounted) return;
        if (wsRef.current === ws) wsRef.current = null;
        setStatus('closed');
        const delay = Math.min(30000, Math.pow(2, retryCount) * 1000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };

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
        qc.removeQueries({ queryKey: ['activities', issueId] });
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

      // Slice 71：activity 活数据 — append / invalidate ['activities', issueId]
      if (event.type === 'activity:created') {
        const { issueId, activity } = event;
        qc.setQueryData<ActivityLog[]>(['activities', issueId], (old) => {
          if (!old) return [activity];
          if (old.some((a) => a.id === activity.id)) return old;
          return [...old, activity];
        });
        // 无 cache 时也 invalidate，确保挂载后能拉到新数据
        qc.invalidateQueries({ queryKey: ['activities', issueId] });
      }

      if (event.type === 'automation:updated') {
        qc.invalidateQueries({ queryKey: ['automation-rules'] });
        qc.invalidateQueries({
          queryKey: ['automation-runs', event.automationRun.ruleId],
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
          if (run.autoRetryStatus === 'scheduled') {
            toastSuccess(
              `基础设施故障，已自动重试 ${run.attempt ?? 1}/${run.maxAttempts ?? 2}`,
              {
                action: run.autoRetryChildId
                  ? {
                      label: '查看自动重试',
                      href: `/runs/${encodeURIComponent(run.autoRetryChildId)}`,
                    }
                  : undefined,
                durationMs: 8000,
              },
            );
            return;
          }
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
          // handled by runtime:event
        } else if (message.kind === 'tool_end') {
          // handled by runtime:event
        } else if (message.kind === 'assistant' && message.body?.trim()) {
          appendPartial(message.runId, message.body);
        }
      }

      if (event.type === 'runtime:event') {
        const rEvent = event.event;
        if (rEvent.kind === 'tool_use') {
          const toolName = (rEvent.metadata?.toolName as string) || 'tool';
          setTool(rEvent.runId, toolName);
          setProgress(rEvent.runId, `🛠️ 正在执行 [${toolName}]...`);
        } else if (rEvent.kind === 'tool_result') {
          const toolName = rEvent.metadata?.toolName as string | undefined;
          setTool(rEvent.runId, '');
          const duration = rEvent.metadata?.duration ? ` (${rEvent.metadata.duration}ms)` : '';
          setProgress(rEvent.runId, toolName ? `工具完成 · ${toolName}${duration}` : '工具步骤完成');
        }
      }

      // bu01：Run progress
      if (event.type === 'run:progress') {
        setProgress(event.runId, event.text.slice(0, 100));
        const t = event.text?.trim() ?? '';
        const noise =
          !t ||
          t.length < 8 ||
          /^(进度|等待|排队|工具|\[claude\]|\[cursor\]|\[opencode\]|\[grok\]|stale:|heartbeat)/i.test(
            t,
          ) ||
          t.includes('等待本机目录') ||
          t.includes('等待进度');
        if (!noise && t.length >= 12) {
          appendPartial(event.runId, t);
        }
      }

      // stream chunk
      if (event.type === 'run:stream_chunk') {
        appendStreamChunk(event.runId, event.content);
      }

      // S06 wiki:page-created：invalidate wiki 列表 cache（spec §7.2）
      // WS 事件由 server 的 ingest pipeline → eventBus → wsBroadcaster 自动广播到前端
      // 用 invalidateQueries 而非 setQueryData：新页 content 要从文件系统 GET，
      // 前端无法凭 WS 事件里的 slug+title 构造完整页
      if (event.type === 'wiki:page-created') {
        qc.invalidateQueries({ queryKey: ['wiki-pages'] });
        qc.invalidateQueries({ queryKey: ['wiki-jobs'] });
      }

      // S13: Agent 实时脉冲状态变更
      if (event.type === 'agent:status_changed') {
        qc.invalidateQueries({ queryKey: ['agents'] });
        qc.invalidateQueries({ queryKey: ['agent', event.agentId] });
        qc.invalidateQueries({ queryKey: ['agent-readiness'] });
        qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      }
    };
  }

  connect();

    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      if (ws) ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [qc, setStatus, setProgress, setTool, appendPartial, appendStreamChunk, clearProgress]);
}
