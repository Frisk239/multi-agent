'use client';
/**
 * O3 拆分：issues 域 hooks（原 lib/api.ts 211-1186 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  Issue,
  IssueLabel,
  Comment,
  ActivityLog,
  CreateIssueInput,
  UpdateIssueInput,
  CreateIssueLabelInput,
  UpdateIssueLabelInput,
  CreateCommentInput,
  AgentSummary,
  SquadSummary,
  SquadDetail,
  InboxItem,
  InboxListResponse,
  IssueSearchHit,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  IssueSubscription,
  IssueStatus,
  PaginatedResponse,
  BulkUpdateIssueAssigneeResponse,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastEnqueueMeta } from './http';
import type { IssuesQuery, IssueWithEnqueue } from './http';
import { issuesQueryKey, buildIssuesUrl } from './http';
import { toastError, toastSuccess } from '../toast';
import { encodeFilenameHeader } from '../attachment-upload';
import { mapIssueRows, optimisticOptions, removeIssueRows } from '../optimistic';

export function useIssues(params?: IssuesQuery) {
  return useQuery<PaginatedResponse<Issue>>({
    queryKey: issuesQueryKey(params),
    queryFn: async () => {
      const res = await apiFetch(buildIssuesUrl(params));
      if (!res.ok) throw new Error('加载失败');
      return res.json();
    },
    // G7-2：看板-详情往返不闪屏——30s 内复用缓存，返回时不再整板 refetch +
    // skeleton 闪烁。invalidateQueries 仍强制 refetch（乐观更新/WS 回灌不受影响）。
    staleTime: 30_000,
  });
}

/**
 * S6：含**评论正文**的「找回」搜索。与 useIssues 的 q 分开——后者是列表筛选，
 * 这里带 snippet 与 commentId，用于 CmdK 与全局搜索。
 */
export function useIssueSearch(query: string, opts?: { limit?: number; enabled?: boolean }) {
  const q = query.trim();
  return useQuery<{ data: IssueSearchHit[]; total: number; query: string }>({
    queryKey: ['issue-search', q, opts?.limit ?? 30],
    enabled: (opts?.enabled ?? true) && q.length > 0,
    queryFn: async () => {
      const sp = new URLSearchParams({ q });
      if (opts?.limit) sp.set('limit', String(opts.limit));
      const res = await apiFetch(`${API}/issues/search?${sp.toString()}`);
      if (!res.ok) throw new Error('搜索失败');
      return res.json();
    },
  });
}

export function useIssue(id: string) {
  return useQuery<Issue>({
    queryKey: ['issue', id],
    queryFn: async () => {
      const res = await apiFetch(`${API}/issues/${id}`);
      if (!res.ok) throw new Error('issue 不存在');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useComments(issueId: string) {
  return useQuery<Comment[]>({
    queryKey: ['comments', issueId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/issues/${issueId}/comments`);
      if (!res.ok) throw new Error('加载评论失败');
      return res.json();
    },
    enabled: !!issueId,
  });
}

/** Slice 71：Issue 活动日志 RQ；WS activity:created 会 append / invalidate */
export function useActivities(issueId: string) {
  return useQuery<ActivityLog[]>({
    queryKey: ['activities', issueId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/issues/${issueId}/activities`);
      if (!res.ok) throw new Error('加载活动失败');
      const data = (await res.json()) as { activities?: ActivityLog[] };
      return data.activities ?? [];
    },
    enabled: !!issueId,
  });
}

/** G25：archived=0 默认活跃；1=归档；all=全部 */
export function useAgents(opts?: { archived?: '0' | '1' | 'all' }) {
  const archived = opts?.archived ?? '0';
  return useQuery<AgentSummary[]>({
    queryKey: ['agents', archived],
    queryFn: async () => {
      const qs = archived === '0' ? '' : `?archived=${archived}`;
      const res = await apiFetch(`${API}/agents${qs}`);
      if (!res.ok) throw new Error('加载 agents 失败');
      return res.json();
    },
  });
}

/** G2-9：view='archived' → `?archived=1`（仅归档小队，含 archivedAt）；默认 active 无参 */
export function useSquads(view?: 'active' | 'archived') {
  const v = view ?? 'active';
  return useQuery<SquadSummary[]>({
    queryKey: ['squads', v],
    queryFn: async () => {
      const res = await apiFetch(`${API}/squads${v === 'archived' ? '?archived=1' : ''}`);
      if (!res.ok) throw new Error('加载 squads 失败');
      return res.json();
    },
  });
}

// GET /api/squads/:id —— S12 小队详情
export function useSquad(id: string) {
  return useQuery<SquadDetail>({
    queryKey: ['squad', id],
    queryFn: async () => {
      const res = await apiFetch(`${API}/squads/${id}`);
      if (!res.ok) throw new Error('squad 不存在');
      return res.json();
    },
    enabled: !!id,
  });
}

// GET /api/inbox —— bu01 真表 InboxListResponse
export function useInbox(opts?: { includeArchived?: boolean }) {
  const includeArchived = opts?.includeArchived !== false;
  return useQuery<InboxListResponse>({
    queryKey: ['inbox', includeArchived ? 'all' : 'active'],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (includeArchived) sp.set('includeArchived', '1');
      // 归档区需要足够窗口；200 为 API 上限
      sp.set('limit', '200');
      const res = await apiFetch(`${API}/inbox?${sp.toString()}`);
      if (!res.ok) throw new Error('加载 Inbox 失败');
      return res.json();
    },
  });
}

// GET /api/inbox/unread-count —— 侧栏角标
export function useInboxUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['inbox-unread'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/inbox/unread-count`);
      if (!res.ok) throw new Error('加载未读失败');
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

// GET /api/runs/active-count —— 侧栏「运行」在途角标 + agentsWorking
export function useRunsActiveCount() {
  return useQuery<{
    count: number;
    queued: number;
    running: number;
    agentsWorking: number;
  }>({
    queryKey: ['runs-active-count'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/runs/active-count`);
      if (!res.ok) throw new Error(await apiError(res, '加载活跃运行数失败'));
      const data = (await res.json()) as {
        count: number;
        queued: number;
        running: number;
        agentsWorking?: number;
      };
      return {
        count: data.count,
        queued: data.queued,
        running: data.running,
        agentsWorking: data.agentsWorking ?? 0,
      };
    },
    refetchInterval: 15_000,
  });
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API}/inbox/${id}/read`, { method: 'POST' });
      if (!res.ok) throw new Error('标记已读失败');
      return res.json() as Promise<InboxItem>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread'] });
    },
    onError: (err) => toastError(errMessage(err, '标记已读失败')),
  });
}

/** 批量已读：POST /api/inbox/read-many */
export function useMarkInboxReadMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) {
        return { requested: 0, updated: 0, unreadCount: 0 };
      }
      const res = await apiFetch(`${API}/inbox/read-many`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unique }),
      });
      if (!res.ok) throw new Error(await apiError(res, '批量已读失败'));
      return res.json() as Promise<{
        requested: number;
        updated: number;
        unreadCount: number;
      }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread'] });
      if (r.requested === 0) return;
      toastSuccess(`已标记 ${r.updated}/${r.requested} 条已读`);
    },
    onError: (err) => toastError(errMessage(err, '批量已读失败')),
  });
}

/** 批量归档：POST /api/inbox/archive-many */
export function useArchiveInboxMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) {
        return { requested: 0, updated: 0, unreadCount: 0 };
      }
      const res = await apiFetch(`${API}/inbox/archive-many`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unique }),
      });
      if (!res.ok) throw new Error(await apiError(res, '批量归档失败'));
      return res.json() as Promise<{
        requested: number;
        updated: number;
        unreadCount: number;
      }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread'] });
      if (r.requested === 0) return;
      toastSuccess(`已归档 ${r.updated}/${r.requested} 条`);
    },
    onError: (err) => toastError(errMessage(err, '批量归档失败')),
  });
}

export function useArchiveInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API}/inbox/${id}/archive`, { method: 'POST' });
      if (!res.ok) throw new Error('归档失败');
      return res.json() as Promise<InboxItem>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread'] });
      toastSuccess('已归档');
    },
    onError: (err) => toastError(errMessage(err, '归档失败')),
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIssueInput) => {
      const res = await apiFetch(`${API}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建失败'));
      return res.json() as Promise<IssueWithEnqueue>;
    },
    onSuccess: (issue) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      if (issue.parentIssueId) {
        qc.invalidateQueries({ queryKey: ['issue-children', issue.parentIssueId] });
        qc.invalidateQueries({ queryKey: ['issue', issue.parentIssueId] });
      }
      if (issue.projectId) {
        qc.invalidateQueries({ queryKey: ['projects'] });
        qc.invalidateQueries({ queryKey: ['project', issue.projectId] });
      }
      toastSuccess(`已创建 ${issue.identifier}`, {
        action: { label: '打开', href: `/issues/${issue.id}` },
        durationMs: 6000,
      });
      if (issue.enqueue?.status === 'skipped') {
        qc.invalidateQueries({ queryKey: ['inbox'] });
        qc.invalidateQueries({ queryKey: ['inbox-unread'] });
        toastEnqueueMeta(issue.id, issue.enqueue);
      } else if (issue.enqueue?.status === 'queued') {
        qc.invalidateQueries({ queryKey: ['runs'] });
      }
    },
    onError: (err: any) => {
      if (err?.code === 'readiness_failed') {
        let href = '/';
        let label = '打开';
        if (err.reason === 'cwd_missing') { href = '/settings'; label = '保存工作区'; }
        else if (err.reason === 'runtime_missing') { href = '/runtimes'; label = '运行时探测'; }
        else if (err.reason === 'readiness_error') { href = '/settings'; label = '环境诊断'; }
        else if (err.reason === 'no_leader') { href = '/squads'; label = '小队列表'; }
        else if (err.reason === 'agent_archived') { href = '/agents?scope=archived'; label = '查看已归档智能体'; }
        toastError(err.message, { action: { label, href }, durationMs: 8000 });
      } else {
        toastError(errMessage(err, '创建失败'));
      }
    },
  });
}

/** GET /api/issues/:id/children —— 子 issue 列表 */
export function useIssueChildren(issueId: string) {
  return useQuery<Issue[]>({
    queryKey: ['issue-children', issueId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/issues/${issueId}/children`);
      if (!res.ok) throw new Error(await apiError(res, '加载子 issue 失败'));
      return res.json();
    },
    enabled: !!issueId,
  });
}

export function useIssueSubscription(issueId: string) {
  return useQuery<IssueSubscription>({
    queryKey: ['issue-subscription', issueId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/issues/${issueId}/subscription`);
      if (!res.ok) throw new Error(await apiError(res, '加载订阅状态失败'));
      return res.json();
    },
    enabled: !!issueId,
  });
}

export function useToggleIssueSubscription(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subscribed: boolean) => {
      const path = subscribed ? 'unsubscribe' : 'subscribe';
      const res = await apiFetch(`${API}/issues/${issueId}/${path}`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(
          await apiError(res, subscribed ? '取消关注失败' : '关注失败'),
        );
      }
      return res.json() as Promise<IssueSubscription>;
    },
    onSuccess: (sub) => {
      qc.setQueryData(['issue-subscription', issueId], sub);
      toastSuccess(sub.subscribed ? '已关注此 Issue' : '已取消关注');
    },
    onError: (err) => toastError(errMessage(err, '更新关注失败')),
  });
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/projects`);
      if (!res.ok) throw new Error(await apiError(res, '加载项目失败'));
      return res.json();
    },
  });
}

export function useProject(id: string) {
  return useQuery<Project>({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await apiFetch(`${API}/projects/${id}`);
      if (!res.ok) throw new Error(await apiError(res, 'project 不存在'));
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await apiFetch(`${API}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建项目失败'));
      return res.json() as Promise<Project>;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toastSuccess(`已创建项目「${project.title}」`, {
        action: { label: '打开', href: `/projects/${project.id}` },
        durationMs: 6000,
      });
    },
    onError: (err) => toastError(errMessage(err, '创建项目失败')),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProjectInput }) => {
      const res = await apiFetch(`${API}/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '更新项目失败'));
      return res.json() as Promise<Project>;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.setQueryData(['project', project.id], project);
      qc.invalidateQueries({ queryKey: ['issues'] });
      toastSuccess('已保存项目');
    },
    onError: (err) => toastError(errMessage(err, '更新项目失败')),
  });
}

/** 删除项目：服务端会先清空 issue.project_id */
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API}/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await apiError(res, '删除项目失败'));
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.removeQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['issues'] });
      toastSuccess('已删除项目');
    },
    onError: (err) => toastError(errMessage(err, '删除项目失败')),
  });
}

export function useCreateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const res = await apiFetch(`${API}/issues/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('评论失败');
      return res.json() as Promise<Comment & { dispatches?: unknown[] }>;
    },
    // R9：写入 cache；有 @mention 时服务端会追加系统「派发」comment → invalidate 拉全量
    // B3：toast 按 runId 成败，不全绿谎报
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(['comments', issueId], (old) => {
        if (!old) return [comment];
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
      type DispatchRow = {
        runId?: string | null;
        note?: string;
        targetLabel?: string;
        kind?: string;
      };
      const list = Array.isArray(comment.dispatches)
        ? (comment.dispatches as DispatchRow[])
        : [];
      const n = list.length;
      if (n > 0) {
        qc.invalidateQueries({ queryKey: ['comments', issueId] });
        qc.invalidateQueries({ queryKey: ['runs', issueId] });
        qc.invalidateQueries({ queryKey: ['runs'] });
        const queued = list.filter((d) => typeof d.runId === 'string' && d.runId);
        const skipped = list.filter((d) => !d.runId);
        const firstRunId = queued[0]?.runId as string | undefined;
        const href = firstRunId
          ? `/runs?run=${encodeURIComponent(firstRunId)}`
          : `/issues/${encodeURIComponent(issueId)}`;

        if (queued.length === n) {
          toastSuccess(`已派发 ${n} 个 @提及`, {
            action: { label: '查看运行', href },
            durationMs: 7000,
          });
        } else if (queued.length > 0) {
          const skipNotes = skipped
            .map((d) => d.note || d.targetLabel || '跳过')
            .slice(0, 2)
            .join('；');
          toastSuccess(
            `已派发 ${queued.length}/${n} 个 @提及；${skipped.length} 个未开工${skipNotes ? `（${skipNotes}）` : ''}`,
            {
              action: { label: '查看', href },
              durationMs: 9000,
            },
          );
        } else {
          const notes = skipped
            .map((d) => {
              const who = d.targetLabel ? `@${d.targetLabel}` : '@提及';
              return `${who}：${d.note ?? '未开工'}`;
            })
            .slice(0, 3)
            .join('；');
          const noLeader = skipped.some((d) =>
            (d.note ?? '').includes('无 leader'),
          );
          toastError(notes || `${n} 个 @提及均未开工`, {
            action: noLeader
              ? { label: '小队列表', href: '/squads' }
              : { label: '打开 Issue', href: `/issues/${encodeURIComponent(issueId)}` },
            durationMs: 9000,
          });
        }
      }
    },
    onError: (err) => toastError(errMessage(err, '评论失败')),
  });
}

type ThreadResolutionAction = 'resolve' | 'unresolve';

/**
 * S3 已有的根评论定论接口。服务端只回传更新后的 root，故在同一条 comments
 * React Query cache 内精确替换它，避免 resolve/unresolve 后等待整页重新拉取。
 */
function useCommentThreadResolution(
  issueId: string,
  action: ThreadResolutionAction,
) {
  const qc = useQueryClient();
  const isResolve = action === 'resolve';
  const successMessage = isResolve ? '已将最后回复设为结论' : '已撤销定论';
  const failureMessage = isResolve ? '设定结论失败' : '撤销定论失败';

  return useMutation({
    mutationFn: async (rootCommentId: string) => {
      const res = await apiFetch(`${API}/comments/${rootCommentId}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await apiError(res, failureMessage));
      const data = (await res.json()) as { success?: boolean; comment?: Comment };
      if (!data.comment) throw new Error(failureMessage);
      return data.comment;
    },
    onSuccess: (updatedRoot) => {
      qc.setQueryData<Comment[]>(['comments', issueId], (old) => {
        if (!old) return old;
        return old.map((comment) =>
          comment.id === updatedRoot.id ? updatedRoot : comment,
        );
      });
      toastSuccess(successMessage);
    },
    onError: (err) => toastError(errMessage(err, failureMessage)),
  });
}

/** 根评论的最后一条直接回复设为结论（服务端负责选择与幂等）。 */
export function useResolveCommentThread(issueId: string) {
  return useCommentThreadResolution(issueId, 'resolve');
}

/** 清除根评论的结论标记，恢复全部一层回复。 */
export function useUnresolveCommentThread(issueId: string) {
  return useCommentThreadResolution(issueId, 'unresolve');
}

/* ───────────────────────── W1 · 附件数据层 ───────────────────────── */

/**
 * 附件元数据。后端 `AttachmentMeta`（`server/src/attachments/service.ts`）的镜像。
 * shared 未导出该类型，本刀不为此改 shared，故在 web 侧本地声明。
 * `downloadUrl` 后端已带 `/api` 前缀（形如 `/api/attachments/<id>`）。
 */
export type AttachmentMeta = {
  id: string;
  issueId: string;
  commentId: string | null;
  originalName: string;
  mime: string;
  sizeBytes: number;
  downloadUrl: string;
  createdAt: string;
};

/**
 * 把后端 `downloadUrl`（已含 `/api`）拼成可点的绝对地址。
 * `API` 形如 `http://localhost:3001/api`，直接相加会得到 `/api/api/...`，
 * 所以先削掉尾部 `/api` 再拼。
 */
export function attachmentHref(downloadUrl: string): string {
  const origin = API.replace(/\/api\/?$/, '');
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl;
  return `${origin}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
}

export function useIssueAttachments(issueId: string) {
  return useQuery<AttachmentMeta[]>({
    queryKey: ['attachments', issueId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/issues/${issueId}/attachments`);
      if (!res.ok) throw new Error(await apiError(res, '加载附件失败'));
      return res.json();
    },
    enabled: !!issueId,
  });
}

/**
 * 上传附件：**原始二进制 body**（不是 multipart / FormData）+ `X-Filename` 头。
 * 头是 latin-1，所以中文名先 `encodeFilenameHeader`（percent-encode），
 * 服务端 `decodeFilenameHeader` 解回来。成功返 201 + AttachmentMeta。
 */
export function useUploadAttachment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await apiFetch(`${API}/issues/${issueId}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': encodeFilenameHeader(file.name),
        },
        body: file,
      });
      if (!res.ok) throw new Error(await apiError(res, '上传附件失败'));
      return res.json() as Promise<AttachmentMeta>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', issueId] });
    },
    onError: (err) => toastError(errMessage(err, '上传附件失败')),
  });
}

export function useDeleteAttachment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await apiFetch(`${API}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await apiError(res, '删除附件失败'));
      return attachmentId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', issueId] });
      toastSuccess('已删除附件');
    },
    onError: (err) => toastError(errMessage(err, '删除附件失败')),
  });
}

/** DS2：整列重排 */
export function useReorderIssues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status: IssueStatus; orderedIds: string[] }) => {
      const res = await apiFetch(`${API}/issues/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '重排失败'));
      return res.json() as Promise<Issue[]>;
    },
    onMutate: async ({ status, orderedIds }) => {
      await qc.cancelQueries({ queryKey: ['issues'] });
      const prevLists = qc.getQueriesData<PaginatedResponse<Issue>>({ queryKey: ['issues'] });
      qc.setQueriesData<PaginatedResponse<Issue>>({ queryKey: ['issues'] }, (old) => {
        if (!old) return old;
        const byId = new Map(old.data.map((i) => [i.id, i]));
        const touched = new Set(orderedIds);
        const rest = old.data.filter((i) => !touched.has(i.id));
        const reordered = orderedIds
          .map((id, index) => {
            const base = byId.get(id);
            if (!base) return null;
            return { ...base, status, position: index };
          })
          .filter((x): x is Issue => Boolean(x));
        const newData = [...rest, ...reordered].sort((a, b) => {
          if (a.status !== b.status) return a.status.localeCompare(b.status);
          if (a.position !== b.position) return a.position - b.position;
          return a.createdAt < b.createdAt ? 1 : -1;
        });
        return { ...old, data: newData };
      });
      return { prevLists };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prevLists) {
        for (const [key, data] of ctx.prevLists) {
          qc.setQueryData(key, data);
        }
      }
      toastError(errMessage(err, '重排失败'));
    },
    onSuccess: (issues) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      for (const issue of issues) {
        qc.setQueryData<Issue>(['issue', issue.id], issue);
      }
    },
  });
}

export function useBulkUpdateIssueStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { issueIds: string[]; status: string }) => {
      const res = await apiFetch(`${API}/issues/bulk-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '批量更新状态失败'));
      return res.json() as Promise<{ success: boolean; updatedCount: number }>;
    },
    // W2：乐观 patch 全部 ['issues'] 前缀列表（与 ws.ts 回灌同 key 同 shape，按 id 幂等替换）
    ...optimisticOptions<{ issueIds: string[]; status: string }>({
      queryClient: qc,
      queryKeys: () => [['issues']],
      apply: (vars, old) => {
        const ids = new Set(vars.issueIds);
        return mapIssueRows<Issue>(old, (row) =>
          ids.has(row.id) ? { ...row, status: vars.status as IssueStatus } : row,
        );
      },
      invalidateKeys: [['issues']],
      fallbackMessage: '批量更新状态失败',
    }),
    onSuccess: (r) => {
      toastSuccess(`已更新 ${r.updatedCount} 项状态`);
    },
  });
}

export function useBulkUpdateIssueAssignee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      issueIds: string[];
      assigneeType: string | null;
      assigneeId: string | null;
    }) => {
      const res = await apiFetch(`${API}/issues/bulk-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '批量指派失败'));
      return res.json() as Promise<BulkUpdateIssueAssigneeResponse>;
    },
    // W2：乐观 patch 列表；指派只带 {type,id} + label 占位 ''（label 由 server 回填，
    // 与 useUpdateIssue 同口径 —— bulk-assign 响应不含 label）
    ...optimisticOptions<
      { issueIds: string[]; assigneeType: string | null; assigneeId: string | null }
    >({
      queryClient: qc,
      queryKeys: () => [['issues']],
      apply: (vars, old) => {
        const ids = new Set(vars.issueIds);
        const assignee: Issue['assignee'] = vars.assigneeId
          ? { type: vars.assigneeType as 'agent' | 'squad', id: vars.assigneeId, label: '' }
          : null;
        return mapIssueRows<Issue>(old, (row) =>
          ids.has(row.id) ? { ...row, assignee } : row,
        );
      },
      invalidateKeys: [['issues']],
      fallbackMessage: '批量指派失败',
    }),
    onSuccess: (r) => {
      if (r.updatedCount === 0) {
        toastSuccess('没有需要更改的指派');
      } else {
        const parts = [`已更改 ${r.updatedCount} 项指派`];
        if (r.enqueuedCount > 0) parts.push(`已入队 ${r.enqueuedCount} 项`);
        if (r.notApplicableCount > 0) {
          parts.push(`${r.notApplicableCount} 项未创建新 run（未指派或无需派发）`);
        }
        toastSuccess(parts.join('，'));
      }

      if (r.skippedCount > 0) {
        const details = r.skipped
          .slice(0, 2)
          .map((skip) => skip.detail ?? skip.reason)
          .join('；');
        const more = r.skippedCount > 2 ? `；另有 ${r.skippedCount - 2} 项` : '';
        const first = r.skipped[0];
        toastError(`${r.skippedCount} 项未启动：${details}${more}`, {
          action: first
            ? { label: '查看 Issue', href: `/issues/${encodeURIComponent(first.issueId)}` }
            : undefined,
          durationMs: 8000,
        });
      }
    },
  });
}

export function useBulkDeleteIssues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { issueIds: string[] }) => {
      const res = await apiFetch(`${API}/issues/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '批量删除失败'));
      return res.json() as Promise<{ success: boolean; deletedCount: number }>;
    },
    // W2：乐观从全部 ['issues'] 前缀列表移除（与 ws.ts issue:deleted 同 key 同 shape）；
    // 详情缓存直接 remove（与 useDeleteIssue 同口径：回滚只还原列表，详情重新挂载即 refetch）
    ...optimisticOptions<{ issueIds: string[] }>({
      queryClient: qc,
      queryKeys: () => [['issues']],
      apply: (vars, old) => removeIssueRows<Issue>(old, new Set(vars.issueIds)),
      afterMutate: (vars) => {
        for (const id of vars.issueIds) {
          qc.removeQueries({ queryKey: ['issue', id] });
          qc.removeQueries({ queryKey: ['comments', id] });
        }
      },
      invalidateKeys: [['issues']],
      fallbackMessage: '批量删除失败',
    }),
    onSuccess: (r) => {
      toastSuccess(`已删除 ${r.deletedCount} 项`);
    },
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateIssueInput }) => {
      const res = await apiFetch(`${API}/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('更新失败');
      return res.json() as Promise<IssueWithEnqueue>;
    },
    // D12 + R2：只乐观 Issue 字段
    // W2：从「精确 ['issues'] 单 key」扩到全部 ['issues'] 前缀列表（含筛选/搜索板），
    // 与 ws.ts issue:updated 回灌同 key 同 shape（行级按 id 幂等替换）。
    // 注意：assignee 在 UpdateIssueInput 无 label，乐观只 patch {type,id} + label 占位 ''，
    // 完整 label 由 server 响应（onSuccess setQueryData(['issue', id])）回填。
    ...optimisticOptions<{ id: string; input: UpdateIssueInput }>({
      queryClient: qc,
      queryKeys: (vars) => [['issues'], ['issue', vars.id]],
      apply: (vars, old) =>
        mapIssueRows<Issue>(old, (row) => {
          if (row.id !== vars.id) return row;
          const { assignee, ...rest } = vars.input;
          const patch: Partial<Issue> = { ...rest };
          if (assignee !== undefined) {
            patch.assignee =
              assignee === null ? null : { type: assignee.type, id: assignee.id, label: '' };
          }
          return { ...row, ...patch };
        }),
      invalidateKeys: [['issues']],
      fallbackMessage: '更新失败',
    }),
    onSuccess: (issue) => {
      // issue-find：issues 带筛选 queryKey，统一 invalidate 前缀
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.setQueryData<Issue>(['issue', issue.id], issue);
      // 时间线条等 WS comment:created；也可 invalidate 兜底
      qc.invalidateQueries({ queryKey: ['comments', issue.id] });
      // issue-subtasks：子状态变 → 父进度；父列表刷新
      if (issue.parentIssueId) {
        qc.invalidateQueries({ queryKey: ['issue-children', issue.parentIssueId] });
        qc.invalidateQueries({ queryKey: ['issue', issue.parentIssueId] });
      }
      qc.invalidateQueries({ queryKey: ['issue-children', issue.id] });
      // projects-mvp：归属变更刷新项目列表/详情
      qc.invalidateQueries({ queryKey: ['projects'] });
      if (issue.projectId) {
        qc.invalidateQueries({ queryKey: ['project', issue.projectId] });
      }
      // Slice2：指派后未开工 → toast + 收件箱
      if (issue.enqueue?.status === 'skipped') {
        qc.invalidateQueries({ queryKey: ['inbox'] });
        qc.invalidateQueries({ queryKey: ['inbox-unread'] });
        qc.invalidateQueries({ queryKey: ['comments', issue.id] });
        toastEnqueueMeta(issue.id, issue.enqueue);
      } else if (issue.enqueue?.status === 'queued') {
        qc.invalidateQueries({ queryKey: ['runs'] });
      }
    },
  });
}

/** DELETE /api/issues/:id —— 看板/菜单硬删除（学 Multica） */
export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API}/issues/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(await apiError(res, '删除失败'));
      }
      return id;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['issues'] });
      const prevList = qc.getQueryData<PaginatedResponse<Issue>>(['issues']);
      const parentId = prevList?.data?.find((i) => i.id === id)?.parentIssueId ?? null;
      qc.setQueryData<PaginatedResponse<Issue>>(['issues'], (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((i) => i.id !== id) };
      });
      qc.removeQueries({ queryKey: ['issue', id] });
      qc.removeQueries({ queryKey: ['comments', id] });
      return { prevList, parentId };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['issues'], ctx.prevList);
      toastError(errMessage(err, '删除失败'));
    },
    onSuccess: (_id, id, ctx) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      if (ctx?.parentId) {
        qc.invalidateQueries({ queryKey: ['issue-children', ctx.parentId] });
        qc.invalidateQueries({ queryKey: ['issue', ctx.parentId] });
      }
      toastSuccess('已删除 issue');
    },
  });
}

// —— issue-labels ——

export function useLabels() {
  return useQuery<IssueLabel[]>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/labels`);
      if (!res.ok) throw new Error('加载标签失败');
      return res.json();
    },
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIssueLabelInput) => {
      const res = await apiFetch(`${API}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建标签失败'));
      return res.json() as Promise<IssueLabel>;
    },
    onSuccess: (label) => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      toastSuccess(`已创建标签 · ${label.name}`, {
        action: {
          label: '看板筛选',
          href: `/?label=${encodeURIComponent(label.id)}`,
        },
        durationMs: 7000,
      });
    },
    onError: (err) => toastError(errMessage(err, '创建标签失败')),
  });
}

export function useUpdateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateIssueLabelInput }) => {
      const res = await apiFetch(`${API}/labels/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '更新标签失败'));
      return res.json() as Promise<IssueLabel>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (err) => toastError(errMessage(err, '更新标签失败')),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API}/labels/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(await apiError(res, '归档标签失败'));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['issues'] });
      toastSuccess('已归档标签');
    },
    onError: (err) => toastError(errMessage(err, '归档标签失败')),
  });
}

export function useSetIssueLabels(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labelIds: string[]) => {
      const res = await apiFetch(`${API}/issues/${encodeURIComponent(issueId)}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelIds }),
      });
      if (!res.ok) throw new Error(await apiError(res, '更新 Issue 标签失败'));
      return res.json() as Promise<Issue>;
    },
    onSuccess: (issue) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.setQueryData<Issue>(['issue', issue.id], issue);
      qc.invalidateQueries({ queryKey: ['labels'] });
    },
    onError: (err) => toastError(errMessage(err, '更新 Issue 标签失败')),
  });
}

