'use client';
/**
 * O3 拆分：chat 域 hooks（原 lib/api.ts 2925-3101 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  AgentRun,
  ChatThread,
  ChatMessage,
  ChatExecContext,
  CreateChatThreadInput,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastError, toastSuccess } from '../toast';

// —— agent-chat ——
export function useChatThreads(opts?: { archived?: boolean }) {
  const archived = opts?.archived === true;
  return useQuery<ChatThread[]>({
    queryKey: ['chat-threads', archived ? 'archived' : 'active'],
    queryFn: async () => {
      const sp = archived ? '?archived=1' : '';
      const res = await apiFetch(`${API}/chat/threads${sp}`);
      if (!res.ok) throw new Error(await apiError(res, '加载会话失败'));
      return res.json();
    },
    refetchInterval: 5_000,
  });
}

export function usePinChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const res = await apiFetch(`${API}/chat/threads/${encodeURIComponent(id)}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) throw new Error(await apiError(res, '置顶失败'));
      return res.json() as Promise<ChatThread>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-threads'] });
    },
    onError: (err) => toastError(errMessage(err, '置顶失败')),
  });
}

export function useArchiveChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const res = await apiFetch(
        `${API}/chat/threads/${encodeURIComponent(id)}/archive`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived }),
        },
      );
      if (!res.ok) throw new Error(await apiError(res, '归档失败'));
      return res.json() as Promise<ChatThread>;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['chat-threads'] });
      toastSuccess(vars.archived ? '已归档会话' : '已取消归档');
    },
    onError: (err) => toastError(errMessage(err, '归档失败')),
  });
}

export function useChatMessages(threadId: string | undefined) {
  return useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', threadId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/chat/threads/${encodeURIComponent(threadId!)}/messages`);
      if (!res.ok) throw new Error(await apiError(res, '加载消息失败'));
      return res.json();
    },
    enabled: !!threadId,
    refetchInterval: 2_500,
  });
}

/** 会话 CLI cwd 模式与路径（服务端真源） */
export function useChatExecContext(threadId: string | undefined) {
  return useQuery<ChatExecContext>({
    queryKey: ['chat-exec-context', threadId],
    queryFn: async () => {
      const res = await apiFetch(
        `${API}/chat/threads/${encodeURIComponent(threadId!)}/exec-context`,
      );
      if (!res.ok) throw new Error(await apiError(res, '加载会话执行目录失败'));
      return res.json();
    },
    enabled: !!threadId,
    staleTime: 5_000,
  });
}

/** B1：会话绑 / 解绑项目 → CLI cwd = project.localPath */
export function useUpdateChatThreadProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      projectId,
    }: {
      id: string;
      projectId: string | null;
    }) => {
      const res = await apiFetch(
        `${API}/chat/threads/${encodeURIComponent(id)}/project`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        },
      );
      if (!res.ok) throw new Error(await apiError(res, '绑定项目失败'));
      return res.json() as Promise<ChatThread & { execContext?: ChatExecContext }>;
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['chat-threads'] });
      qc.invalidateQueries({ queryKey: ['chat-exec-context', vars.id] });
      if (data.execContext) {
        qc.setQueryData(['chat-exec-context', vars.id], data.execContext);
      }
      toastSuccess(
        data.projectId
          ? `已绑项目「${data.projectTitle ?? data.projectId.slice(0, 8)}」`
          : '已解除项目绑定（隔离执行）',
      );
    },
    onError: (err) => toastError(errMessage(err, '绑定项目失败')),
  });
}

export function useCreateChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateChatThreadInput) => {
      const res = await apiFetch(`${API}/chat/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建会话失败'));
      return res.json() as Promise<ChatThread>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-threads'] });
    },
    onError: (err) => toastError(errMessage(err, '创建会话失败')),
  });
}

export function usePostChatMessage(threadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!threadId) throw new Error('无会话');
      const res = await apiFetch(
        `${API}/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) throw new Error(await apiError(res, '发送失败'));
      return res.json() as Promise<{ message: ChatMessage; run: AgentRun }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chat-messages', threadId] });
      qc.invalidateQueries({ queryKey: ['chat-threads'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      if (data.run?.id) {
        toastSuccess(`已发送 · run ${data.run.id.slice(0, 8)}…`, {
          action: {
            label: '查看运行',
            href: `/runs?run=${encodeURIComponent(data.run.id)}&status=all`,
          },
        });
      }
    },
    onError: (err) => toastError(errMessage(err, '发送失败')),
  });
}

