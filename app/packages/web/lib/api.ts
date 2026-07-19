'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Issue,
  IssueLabel,
  Comment,
  CreateIssueInput,
  UpdateIssueInput,
  CreateIssueLabelInput,
  UpdateIssueLabelInput,
  CreateCommentInput,
  AgentSummary,
  AgentDetail,
  AgentReadiness,
  AgentWorkStats,
  CreateAgentInput,
  UpdateAgentInput,
  CreateSquadInput,
  UpdateSquadInput,
  SkillInfo,
  SquadSummary,
  SquadDetail,
  InboxItem,
  InboxListResponse,
  AgentRun,
  RunMessage,
  RuntimesResponse,
  WikiPage,
  WikiPageSummary,
  WikiQueryResult,
  WikiHealthResult,
  WikiLintResult,
  WikiIngestJob,
  CreateWikiPageInput,
  CreateQuickRunInput,
  SettingsStatusResponse,
  AutomationRule,
  AutomationRun,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  ChatThread,
  ChatMessage,
  CreateChatThreadInput,
} from '@ma/shared';
import { toastError, toastSuccess } from './toast';

const API = 'http://localhost:3001/api';

function errMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === 'string' && body.error) return body.error;
  } catch {
    /* ignore */
  }
  return fallback;
}

export type IssuesQuery = {
  q?: string;
  labelId?: string;
  status?: string;
  priority?: string;
  /** automation | quick_create */
  originType?: 'automation' | 'quick_create';
  /** agent | squad — 须与 assigneeId 成对 */
  assigneeType?: 'agent' | 'squad';
  assigneeId?: string;
  /** 仅未指派 */
  unassigned?: boolean;
  /** 任一 agent/squad 指派（侧栏「我的 issue」） */
  assigned?: boolean;
};

function issuesQueryKey(params?: IssuesQuery) {
  return [
    'issues',
    params?.q?.trim() || '',
    params?.labelId || '',
    params?.status || '',
    params?.priority || '',
    params?.originType || '',
    params?.assigneeType || '',
    params?.assigneeId || '',
    params?.unassigned ? '1' : '',
    params?.assigned ? '1' : '',
  ] as const;
}

function buildIssuesUrl(params?: IssuesQuery) {
  const sp = new URLSearchParams();
  if (params?.q?.trim()) sp.set('q', params.q.trim());
  if (params?.labelId) sp.set('labelId', params.labelId);
  if (params?.status) sp.set('status', params.status);
  if (params?.priority) sp.set('priority', params.priority);
  if (params?.originType) sp.set('originType', params.originType);
  if (params?.assigneeType && params?.assigneeId) {
    sp.set('assigneeType', params.assigneeType);
    sp.set('assigneeId', params.assigneeId);
  }
  if (params?.unassigned) sp.set('unassigned', '1');
  if (params?.assigned) sp.set('assigned', '1');
  const qs = sp.toString();
  return qs ? `${API}/issues?${qs}` : `${API}/issues`;
}

export function useIssues(params?: IssuesQuery) {
  return useQuery<Issue[]>({
    queryKey: issuesQueryKey(params),
    queryFn: async () => {
      const res = await fetch(buildIssuesUrl(params));
      if (!res.ok) throw new Error('加载失败');
      return res.json();
    },
  });
}

export function useIssue(id: string) {
  return useQuery<Issue>({
    queryKey: ['issue', id],
    queryFn: async () => {
      const res = await fetch(`${API}/issues/${id}`);
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
      const res = await fetch(`${API}/issues/${issueId}/comments`);
      if (!res.ok) throw new Error('加载评论失败');
      return res.json();
    },
    enabled: !!issueId,
  });
}

export function useAgents() {
  return useQuery<AgentSummary[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch(`${API}/agents`);
      if (!res.ok) throw new Error('加载 agents 失败');
      return res.json();
    },
  });
}

export function useSquads() {
  return useQuery<SquadSummary[]>({
    queryKey: ['squads'],
    queryFn: async () => {
      const res = await fetch(`${API}/squads`);
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
      const res = await fetch(`${API}/squads/${id}`);
      if (!res.ok) throw new Error('squad 不存在');
      return res.json();
    },
    enabled: !!id,
  });
}

// GET /api/inbox —— bu01 真表 InboxListResponse
export function useInbox() {
  return useQuery<InboxListResponse>({
    queryKey: ['inbox'],
    queryFn: async () => {
      const res = await fetch(`${API}/inbox`);
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
      const res = await fetch(`${API}/inbox/unread-count`);
      if (!res.ok) throw new Error('加载未读失败');
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

// GET /api/runs/active-count —— 侧栏「运行」在途角标
export function useRunsActiveCount() {
  return useQuery<{ count: number; queued: number; running: number }>({
    queryKey: ['runs-active-count'],
    queryFn: async () => {
      const res = await fetch(`${API}/runs/active-count`);
      if (!res.ok) throw new Error(await apiError(res, '加载活跃运行数失败'));
      return res.json();
    },
    refetchInterval: 15_000,
  });
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/inbox/${id}/read`, { method: 'POST' });
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
      const res = await fetch(`${API}/inbox/read-many`, {
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
      const res = await fetch(`${API}/inbox/archive-many`, {
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
      const res = await fetch(`${API}/inbox/${id}/archive`, { method: 'POST' });
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
      const res = await fetch(`${API}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('创建失败');
      return res.json() as Promise<Issue>;
    },
    onSuccess: (issue) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      toastSuccess(`已创建 ${issue.identifier}`, {
        action: { label: '打开', href: `/issues/${issue.id}` },
        durationMs: 6000,
      });
    },
    onError: (err) => toastError(errMessage(err, '创建失败')),
  });
}

export function useCreateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const res = await fetch(`${API}/issues/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('评论失败');
      return res.json() as Promise<Comment & { dispatches?: unknown[] }>;
    },
    // R9：写入 cache；有 @mention 时服务端会追加系统「派发」comment → invalidate 拉全量
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(['comments', issueId], (old) => {
        if (!old) return [comment];
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
      type DispatchRow = { runId?: string | null };
      const list = Array.isArray(comment.dispatches)
        ? (comment.dispatches as DispatchRow[])
        : [];
      const n = list.length;
      if (n > 0) {
        qc.invalidateQueries({ queryKey: ['comments', issueId] });
        qc.invalidateQueries({ queryKey: ['runs', issueId] });
        qc.invalidateQueries({ queryKey: ['runs'] });
        const firstRunId = list.map((d) => d.runId).find((id) => typeof id === 'string' && id);
        // 有具体 run → /runs?run=；否则回 issue 详情 Run 条
        const href = firstRunId
          ? `/runs?run=${encodeURIComponent(firstRunId)}`
          : `/issues/${encodeURIComponent(issueId)}`;
        toastSuccess(`已处理 ${n} 个 @提及派发`, {
          action: { label: '查看运行', href },
        });
      }
    },
    onError: (err) => toastError(errMessage(err, '评论失败')),
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateIssueInput }) => {
      const res = await fetch(`${API}/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('更新失败');
      return res.json() as Promise<Issue>;
    },
    // D12 + R2：只乐观 Issue 字段
    // 注意：assignee 在 UpdateIssueInput 无 label，乐观展开会破坏 Issue.assignee 的 label 形状；
    // 故 assignee 不参与乐观更新，等服务端返回带 label 的完整 Issue（onSuccess）落地。
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ['issues'] });
      await qc.cancelQueries({ queryKey: ['issue', id] });
      const prevList = qc.getQueryData<Issue[]>(['issues']);
      const prevOne = qc.getQueryData<Issue>(['issue', id]);
      const { assignee: _dropAssignee, ...patch } = input;
      qc.setQueryData<Issue[]>(['issues'], (old) =>
        old?.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      );
      if (prevOne) {
        qc.setQueryData<Issue>(['issue', id], { ...prevOne, ...patch });
      }
      return { prevList, prevOne };
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['issues'], ctx.prevList);
      if (ctx?.prevOne) qc.setQueryData(['issue', id], ctx.prevOne);
      toastError(errMessage(err, '更新失败'));
    },
    onSuccess: (issue) => {
      // issue-find：issues 带筛选 queryKey，统一 invalidate 前缀
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.setQueryData<Issue>(['issue', issue.id], issue);
      // 时间线条等 WS comment:created；也可 invalidate 兜底
      qc.invalidateQueries({ queryKey: ['comments', issue.id] });
    },
  });
}

// —— issue-labels ——

export function useLabels() {
  return useQuery<IssueLabel[]>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch(`${API}/labels`);
      if (!res.ok) throw new Error('加载标签失败');
      return res.json();
    },
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIssueLabelInput) => {
      const res = await fetch(`${API}/labels`, {
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
      const res = await fetch(`${API}/labels/${encodeURIComponent(id)}`, {
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
      const res = await fetch(`${API}/labels/${encodeURIComponent(id)}`, {
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
      const res = await fetch(`${API}/issues/${encodeURIComponent(issueId)}/labels`, {
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

// —— S03 Run / Runtimes hooks ——

export function useRuntimes() {
  return useQuery<RuntimesResponse>({
    queryKey: ['runtimes'],
    queryFn: async () => {
      const res = await fetch(`${API}/runtimes`);
      if (!res.ok) throw new Error('加载运行时失败');
      return res.json();
    },
  });
}

export function useRuns(issueId: string) {
  return useQuery<AgentRun[]>({
    queryKey: ['runs', issueId],
    queryFn: async () => {
      const res = await fetch(`${API}/runs?issueId=${encodeURIComponent(issueId)}`);
      if (!res.ok) throw new Error('加载运行失败');
      return res.json();
    },
    enabled: !!issueId,
  });
}

/** 工作区级 runs 列表（issueId 可选） */
export function useWorkspaceRuns(params?: {
  status?: string;
  agentId?: string;
  squadId?: string;
  kind?: string;
  /** 仅小队 leader run */
  isLeader?: boolean;
  limit?: number;
}) {
  const status = params?.status;
  const agentId = params?.agentId;
  const squadId = params?.squadId;
  const kind = params?.kind;
  const isLeader = params?.isLeader;
  const limit = params?.limit ?? 50;
  return useQuery<AgentRun[]>({
    queryKey: [
      'runs',
      'workspace',
      status ?? '',
      agentId ?? '',
      squadId ?? '',
      kind ?? '',
      isLeader === undefined ? '' : isLeader ? '1' : '0',
      limit,
    ],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (status) sp.set('status', status);
      if (agentId) sp.set('agentId', agentId);
      if (squadId) sp.set('squadId', squadId);
      if (kind) sp.set('kind', kind);
      if (isLeader === true) sp.set('isLeader', '1');
      if (isLeader === false) sp.set('isLeader', '0');
      sp.set('limit', String(limit));
      const res = await fetch(`${API}/runs?${sp.toString()}`);
      if (!res.ok) throw new Error(await apiError(res, '加载运行列表失败'));
      return res.json();
    },
  });
}

export function useRetryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${API}/runs/${encodeURIComponent(runId)}/retry`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await apiError(res, '再执行失败'));
      return res.json() as Promise<AgentRun>;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      if (run.issueId) qc.invalidateQueries({ queryKey: ['runs', run.issueId] });
      qc.invalidateQueries({ queryKey: ['agent-runs', run.agentId] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      toastSuccess(`已排队再执行 ${run.id.slice(0, 8)}…`, {
        action: {
          label: '查看运行',
          href: `/runs?run=${encodeURIComponent(run.id)}&status=${encodeURIComponent(run.status || 'queued')}`,
        },
        durationMs: 7000,
      });
    },
    onError: (err) => toastError(errMessage(err, '再执行失败')),
  });
}

export function useRerunIssue(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body?: { runId?: string }) => {
      const res = await fetch(`${API}/issues/${encodeURIComponent(issueId)}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) throw new Error(await apiError(res, '再执行失败'));
      return res.json() as Promise<AgentRun>;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['runs', issueId] });
      qc.invalidateQueries({ queryKey: ['agent-runs', run.agentId] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      toastSuccess('已按当前指派/历史 agent 排队再执行', {
        action: {
          label: '查看运行',
          href: `/runs?run=${encodeURIComponent(run.id)}&status=${encodeURIComponent(run.status || 'queued')}`,
        },
        durationMs: 7000,
      });
    },
    onError: (err) => toastError(errMessage(err, '再执行失败')),
  });
}

export function useRunMessages(runId: string | undefined) {
  return useQuery<RunMessage[]>({
    queryKey: ['run-messages', runId],
    queryFn: async () => {
      const res = await fetch(`${API}/runs/${runId}/messages`);
      if (!res.ok) throw new Error('加载轨迹失败');
      return res.json();
    },
    enabled: !!runId,
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${API}/runs/${runId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('取消失败');
      return res.json() as Promise<AgentRun>;
    },
    onSuccess: (run) => {
      if (run.issueId) {
        qc.invalidateQueries({ queryKey: ['runs', run.issueId] });
      }
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['agent-runs', run.agentId] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      toastSuccess('已请求停止运行', {
        action: {
          label: '查看运行',
          href: `/runs?run=${encodeURIComponent(run.id)}&status=${encodeURIComponent(run.status || 'cancelled')}`,
        },
        durationMs: 7000,
      });
    },
    onError: (err) => toastError(errMessage(err, '取消失败')),
  });
}

// —— S05 Skills / MCP hooks ——

// GET /api/skills —— 内存索引 skill 列表（含 usedBy 反查）
export function useSkills() {
  return useQuery<SkillInfo[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      const res = await fetch(`${API}/skills`);
      if (!res.ok) throw new Error('加载 skills 失败');
      return res.json();
    },
  });
}

// POST /api/skills/refresh —— 重扫目录刷新索引
export function useRefreshSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/skills/refresh`, { method: 'POST' });
      if (!res.ok) throw new Error('重新扫描失败');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

// GET /api/agents/:id —— 单 agent 详情（profile + MCP Tab 回填）
export function useAgent(id: string) {
  return useQuery<AgentDetail | null>({
    queryKey: ['agent', id],
    queryFn: async () => {
      const res = await fetch(`${API}/agents/${id}`);
      if (!res.ok) throw new Error(await apiError(res, '加载 agent 失败'));
      return res.json();
    },
    enabled: !!id,
  });
}

// —— bu02 Agent / Squad 运营 hooks ——

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAgentInput) => {
      const res = await fetch(`${API}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建智能体失败'));
      return res.json() as Promise<AgentDetail>;
    },
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.setQueryData(['agent', agent.id], agent);
      toastSuccess(`已创建 ${agent.name}`, {
        action: { label: '打开', href: `/agents/${agent.id}` },
        durationMs: 6000,
      });
    },
    onError: (err) => toastError(errMessage(err, '创建智能体失败')),
  });
}

export function useUpdateAgent(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAgentInput) => {
      const res = await fetch(`${API}/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '更新智能体失败'));
      return res.json() as Promise<AgentDetail>;
    },
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.setQueryData(['agent', agent.id], agent);
      qc.invalidateQueries({ queryKey: ['agent-readiness', agent.id] });
      toastSuccess('已保存');
    },
    onError: (err) => toastError(errMessage(err, '更新智能体失败')),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentId: string) => {
      const res = await fetch(`${API}/agents/${agentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await apiError(res, '删除智能体失败'));
      return agentId;
    },
    onSuccess: (agentId) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.removeQueries({ queryKey: ['agent', agentId] });
      qc.removeQueries({ queryKey: ['agent-readiness', agentId] });
      qc.removeQueries({ queryKey: ['agent-runs', agentId] });
      toastSuccess('已删除智能体');
    },
    onError: (err) => toastError(errMessage(err, '删除智能体失败')),
  });
}

export function useAgentReadiness(agentId: string) {
  return useQuery<AgentReadiness>({
    queryKey: ['agent-readiness', agentId],
    queryFn: async () => {
      const res = await fetch(`${API}/agents/${agentId}/readiness`);
      if (!res.ok) throw new Error(await apiError(res, '加载 readiness 失败'));
      return res.json();
    },
    enabled: !!agentId,
    refetchInterval: 15_000,
  });
}

/** POST /api/runs/cancel-many —— 批量取消 active runs */
export function useCancelRunsMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) {
        return { requested: 0, cancelled: 0, skipped: 0 };
      }
      const res = await fetch(`${API}/runs/cancel-many`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unique }),
      });
      if (!res.ok) throw new Error(await apiError(res, '批量取消失败'));
      return res.json() as Promise<{
        requested: number;
        cancelled: number;
        skipped: number;
      }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      if (r.requested === 0) return;
      toastSuccess(`已取消 ${r.cancelled}/${r.requested} 条在途 run`, {
        action: { label: '运行列表', href: '/runs?status=active' },
        durationMs: 7000,
      });
    },
    onError: (err) => toastError(errMessage(err, '批量取消失败')),
  });
}

/** POST /api/runs/recover-stuck —— 收尸 orphan/stale/missing-agent runs */
export function useRecoverStuckRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/runs/recover-stuck`, { method: 'POST' });
      if (!res.ok) throw new Error(await apiError(res, '收尸失败'));
      return res.json() as Promise<{
        orphanRunning: number;
        staleRunning: number;
        staleQueued: number;
        missingAgentQueued: number;
        total: number;
      }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread'] });
      if (r.total === 0) toastSuccess('没有需要收尸的卡住 run');
      else {
        toastSuccess(
          `已收尸 ${r.total} 条（running残留 ${r.orphanRunning} · 心跳超时 ${r.staleRunning} · 缺 agent ${r.missingAgentQueued} · 排队过久 ${r.staleQueued}）`,
          {
            action: { label: '失败运行', href: '/runs?status=failed' },
            durationMs: 8000,
          },
        );
      }
    },
    onError: (err) => toastError(errMessage(err, '收尸失败')),
  });
}

/** 批量 readiness：GET /api/agents/readiness?ids=…（单请求，避免 N+1） */
export function useAgentsReadinessMap(agentIds: string[]) {
  const unique = [...new Set(agentIds.filter(Boolean))];
  const key = unique.slice().sort().join(',');
  return useQuery({
    queryKey: ['agents-readiness-map', key],
    queryFn: async () => {
      if (unique.length === 0) return {} as Record<string, AgentReadiness | null>;
      const qs = unique.map((id) => encodeURIComponent(id)).join(',');
      const res = await fetch(`${API}/agents/readiness?ids=${qs}`);
      if (!res.ok) throw new Error(await apiError(res, '加载批量 readiness 失败'));
      const body = (await res.json()) as Record<string, AgentReadiness | null>;
      // 保证请求的 id 都有键（缺失填 null）
      const out: Record<string, AgentReadiness | null> = {};
      for (const id of unique) out[id] = body[id] ?? null;
      return out;
    },
    enabled: unique.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useAgentRuns(agentId: string, limit = 20) {
  return useQuery<AgentRun[]>({
    queryKey: ['agent-runs', agentId, limit],
    queryFn: async () => {
      const res = await fetch(
        `${API}/agents/${agentId}/runs?limit=${encodeURIComponent(String(limit))}`,
      );
      if (!res.ok) throw new Error(await apiError(res, '加载 runs 失败'));
      return res.json();
    },
    enabled: !!agentId,
  });
}

export function useAgentWorkStats(agentId: string, days: number | 'all' = 30) {
  const daysKey = days === 'all' ? 'all' : String(days);
  return useQuery<AgentWorkStats>({
    queryKey: ['agent-work-stats', agentId, daysKey],
    queryFn: async () => {
      const res = await fetch(
        `${API}/agents/${encodeURIComponent(agentId)}/work-stats?days=${encodeURIComponent(daysKey)}`,
      );
      if (!res.ok) throw new Error(await apiError(res, '加载工作统计失败'));
      return res.json();
    },
    enabled: !!agentId,
    staleTime: 15_000,
  });
}

export function useCreateSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSquadInput) => {
      const res = await fetch(`${API}/squads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建小队失败'));
      return res.json() as Promise<SquadDetail>;
    },
    onSuccess: (squad) => {
      qc.invalidateQueries({ queryKey: ['squads'] });
      qc.setQueryData(['squad', squad.id], squad);
      toastSuccess(`已创建 ${squad.name}`, {
        action: { label: '打开', href: `/squads/${squad.id}` },
        durationMs: 6000,
      });
    },
    onError: (err) => toastError(errMessage(err, '创建小队失败')),
  });
}

export function useUpdateSquad(squadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSquadInput) => {
      const res = await fetch(`${API}/squads/${squadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '更新小队失败'));
      return res.json() as Promise<SquadDetail>;
    },
    onSuccess: (squad) => {
      qc.invalidateQueries({ queryKey: ['squads'] });
      qc.setQueryData(['squad', squad.id], squad);
      toastSuccess('已保存');
    },
    onError: (err) => toastError(errMessage(err, '更新小队失败')),
  });
}

export function useDeleteSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (squadId: string) => {
      const res = await fetch(`${API}/squads/${squadId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await apiError(res, '删除小队失败'));
      return squadId;
    },
    onSuccess: (squadId) => {
      qc.invalidateQueries({ queryKey: ['squads'] });
      qc.removeQueries({ queryKey: ['squad', squadId] });
      toastSuccess('已删除小队');
    },
    onError: (err) => toastError(errMessage(err, '删除小队失败')),
  });
}

// GET /api/agents/:id/skills —— 已分配 skillId（name）列表
export function useAgentSkills(agentId: string) {
  return useQuery<string[]>({
    queryKey: ['agent-skills', agentId],
    queryFn: async () => {
      const res = await fetch(`${API}/agents/${agentId}/skills`);
      if (!res.ok) throw new Error('加载分配失败');
      return res.json();
    },
    enabled: !!agentId,
  });
}

// PUT /api/agents/:id/skills —— 整体替换分配
export function useUpdateAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillIds: string[]) => {
      const res = await fetch(`${API}/agents/${agentId}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillIds }),
      });
      if (!res.ok) throw new Error('保存分配失败');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-skills', agentId] });
      qc.invalidateQueries({ queryKey: ['skills'] }); // usedBy 反查会变
    },
  });
}

// GET /api/agents/:id/mcp —— MCP 配置 JSON
export function useAgentMcp(agentId: string) {
  return useQuery<{ mcpServers: string | null }>({
    queryKey: ['agent-mcp', agentId],
    queryFn: async () => {
      const res = await fetch(`${API}/agents/${agentId}/mcp`);
      if (!res.ok) throw new Error('加载 MCP 失败');
      return res.json();
    },
    enabled: !!agentId,
  });
}

// PUT /api/agents/:id/mcp —— 更新 MCP（mcpServers 传 JSON 字符串或 null）
export function useUpdateAgentMcp(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mcpServers: string | null) => {
      const res = await fetch(`${API}/agents/${agentId}/mcp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServers }),
      });
      if (!res.ok) throw new Error('保存 MCP 失败');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-mcp', agentId] });
      qc.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });
}

// —— S06 Wiki hooks ——

// GET /api/wiki/pages —— wiki 页列表（spec §6）
export function useWikiPages() {
  return useQuery<WikiPageSummary[]>({
    queryKey: ['wiki-pages'],
    queryFn: async () => {
      const res = await fetch(`${API}/wiki/pages`);
      if (!res.ok) throw new Error('加载 wiki 失败');
      return res.json();
    },
  });
}

// GET /api/wiki/pages/:slug —— 单页内容（spec §6）
export function useWikiPage(slug: string | null) {
  return useQuery<WikiPage>({
    queryKey: ['wiki-page', slug],
    queryFn: async () => {
      const res = await fetch(`${API}/wiki/pages/${slug}`);
      if (!res.ok) throw new Error('加载 wiki 页失败');
      return res.json();
    },
    enabled: !!slug,
  });
}

// —— S07 Wiki query / health / lint / 存回 hooks ——

// POST /api/wiki/query — 问答（spec §5.5）
export function useWikiQuery() {
  return useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch(`${API}/wiki/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error('查询失败');
      return res.json() as Promise<WikiQueryResult>;
    },
  });
}

// GET /api/wiki/health — 结构检查（手动触发，spec §5.5）
export function useWikiHealth() {
  return useQuery<WikiHealthResult>({
    queryKey: ['wiki-health'],
    queryFn: async () => {
      const res = await fetch(`${API}/wiki/health`);
      if (!res.ok) throw new Error('检查失败');
      return res.json();
    },
    enabled: false, // 手动触发（refetch manually）
  });
}

// POST /api/wiki/lint — 语义检查（spec §5.5）
export function useWikiLint() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/wiki/lint`, { method: 'POST' });
      if (!res.ok) throw new Error('语义检查失败');
      return res.json() as Promise<WikiLintResult>;
    },
  });
}

// GET /api/wiki/jobs — ingest job 列表（wiki-memory-ops）
export function useWikiJobs(status?: string) {
  return useQuery<WikiIngestJob[]>({
    queryKey: ['wiki-jobs', status ?? ''],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (status) sp.set('status', status);
      const qs = sp.toString();
      const res = await fetch(`${API}/wiki/jobs${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(await apiError(res, '加载 wiki jobs 失败'));
      return res.json();
    },
    refetchInterval: 8_000,
  });
}

// POST /api/wiki/jobs/:id/retry — dead → pending
export function useRetryWikiJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`${API}/wiki/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await apiError(res, '重试 job 失败'));
      return res.json() as Promise<WikiIngestJob>;
    },
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ['wiki-jobs'] });
      qc.invalidateQueries({ queryKey: ['wiki-pages'] });
      toastSuccess('已重新排队 Wiki 编译', {
        action: {
          label: '打开 Issue',
          href: `/issues/${job.issueId}`,
        },
        durationMs: 7000,
      });
    },
    onError: (err) => toastError(errMessage(err, '重试 job 失败')),
  });
}

/** POST /api/wiki/jobs/retry-dead —— 批量重试全部 dead */
export function useRetryAllDeadWikiJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/wiki/jobs/retry-dead`, { method: 'POST' });
      if (!res.ok) throw new Error(await apiError(res, '批量重试失败'));
      return res.json() as Promise<{ requested: number; retried: number; skipped: number }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['wiki-jobs'] });
      qc.invalidateQueries({ queryKey: ['wiki-pages'] });
      qc.invalidateQueries({ queryKey: ['settings-status'] });
      if (r.retried === 0) toastSuccess('没有可重试的 dead 任务');
      else {
        toastSuccess(`已重试 ${r.retried}/${r.requested} 条 dead Wiki 任务`, {
          action: { label: 'Wiki 任务', href: '/wiki?jobStatus=pending' },
          durationMs: 7000,
        });
      }
    },
    onError: (err) => toastError(errMessage(err, '批量重试失败')),
  });
}

// POST /api/wiki/pages — 存回 wiki 页（spec §5.5）
export function useCreateWikiPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWikiPageInput) => {
      const res = await fetch(`${API}/wiki/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('保存失败');
      return res.json() as Promise<{ slug: string; title: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki-pages'] });
      toastSuccess('Wiki 页已保存');
    },
    onError: (err) => toastError(errMessage(err, '保存失败')),
  });
}

// —— S11 Memory hooks ——

export type MemoryStatus = {
  provider: string | null;
  available: boolean;
  backend?: string;
};

export type MemoryItem = {
  id: string;
  text: string;
  issueId?: string | null;
  createdAt?: string;
  source?: string;
};

// GET /api/memory/status
export function useMemoryStatus() {
  return useQuery({
    queryKey: ['memory-status'],
    queryFn: async () => {
      const res = await fetch(`${API}/memory/status`);
      if (!res.ok) throw new Error('status 失败');
      return res.json() as Promise<MemoryStatus>;
    },
  });
}

// GET /api/settings/status —— bu04 G0 只读环境诊断
export function useSettingsStatus() {
  return useQuery<SettingsStatusResponse>({
    queryKey: ['settings-status'],
    queryFn: async () => {
      const res = await fetch(`${API}/settings/status`);
      if (!res.ok) throw new Error('加载环境诊断失败');
      return res.json();
    },
    staleTime: 10_000,
  });
}

/** POST /api/settings/workspace-cwd —— 持久化本机工作区路径 */
export function useSetWorkspaceCwd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch(`${API}/settings/workspace-cwd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error(await apiError(res, '保存工作区路径失败'));
      return res.json() as Promise<{
        ok: true;
        cwd: {
          path: string | null;
          source: string;
          exists: boolean;
          configured: boolean;
          persistedPath: string | null;
        };
      }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['settings-status'] });
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents-readiness'] });
      qc.invalidateQueries({ queryKey: ['runtimes'] });
      toastSuccess(`工作区已保存（${r.cwd.source}）`, {
        action: { label: '环境诊断', href: '/settings' },
        durationMs: 6000,
      });
    },
    onError: (err) => toastError(errMessage(err, '保存工作区路径失败')),
  });
}

// GET /api/memory?q= — 空 q 为最近 N 条
export function useMemoryList(q: string) {
  return useQuery({
    queryKey: ['memory', q],
    queryFn: async () => {
      const url = q.trim()
        ? `${API}/memory?q=${encodeURIComponent(q.trim())}`
        : `${API}/memory`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('加载记忆失败');
      return res.json() as Promise<MemoryItem[]>;
    },
  });
}

// POST /api/memory — curated 写入
export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { text: string; issueId?: string }) => {
      const res = await fetch(`${API}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('创建失败');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory'] });
      toastSuccess('记忆已保存');
    },
    onError: (err) => toastError(errMessage(err, '创建失败')),
  });
}

/** DELETE /api/memory/:id */
export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/memory/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await apiError(res, '删除记忆失败'));
      return res.json() as Promise<{ ok: true; id: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memory'] });
      qc.invalidateQueries({ queryKey: ['settings-status'] });
      toastSuccess('已删除记忆', {
        action: { label: '记忆列表', href: '/memory' },
        durationMs: 5000,
      });
    },
    onError: (err) => toastError(errMessage(err, '删除记忆失败')),
  });
}

/** POST /api/memory/delete-many */
export function useDeleteMemoryMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) {
        return { requested: 0, deleted: 0, skipped: 0 };
      }
      const res = await fetch(`${API}/memory/delete-many`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unique }),
      });
      if (!res.ok) throw new Error(await apiError(res, '批量删除失败'));
      return res.json() as Promise<{
        requested: number;
        deleted: number;
        skipped: number;
      }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['memory'] });
      qc.invalidateQueries({ queryKey: ['settings-status'] });
      if (r.requested === 0) return;
      toastSuccess(`已删除 ${r.deleted}/${r.requested} 条记忆`, {
        action: { label: '记忆列表', href: '/memory' },
        durationMs: 6000,
      });
    },
    onError: (err) => toastError(errMessage(err, '批量删除失败')),
  });
}

// —— bu03 Quick Create hooks ——

export function useCreateQuickRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQuickRunInput) => {
      const res = await fetch(`${API}/quick-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '快速派活失败'));
      return res.json() as Promise<{ run: AgentRun }>;
    },
    onSuccess: (data) => {
      const runId = data.run.id;
      toastSuccess(`已派出快速派活 · ${runId.slice(0, 8)}…`, {
        action: {
          label: '查看运行',
          href: `/runs?run=${encodeURIComponent(runId)}&status=all`,
        },
      });
      qc.invalidateQueries({ queryKey: ['agent-runs'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      if (data.run.agentId) {
        qc.invalidateQueries({ queryKey: ['agent-runs', data.run.agentId] });
      }
    },
    onError: (err) => toastError(errMessage(err, '快速派活失败')),
  });
}

// —— agent-chat ——
export function useChatThreads() {
  return useQuery<ChatThread[]>({
    queryKey: ['chat-threads'],
    queryFn: async () => {
      const res = await fetch(`${API}/chat/threads`);
      if (!res.ok) throw new Error(await apiError(res, '加载会话失败'));
      return res.json();
    },
    refetchInterval: 5_000,
  });
}

export function useChatMessages(threadId: string | undefined) {
  return useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', threadId],
    queryFn: async () => {
      const res = await fetch(`${API}/chat/threads/${encodeURIComponent(threadId!)}/messages`);
      if (!res.ok) throw new Error(await apiError(res, '加载消息失败'));
      return res.json();
    },
    enabled: !!threadId,
    refetchInterval: 2_500,
  });
}

export function useCreateChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateChatThreadInput) => {
      const res = await fetch(`${API}/chat/threads`, {
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
      const res = await fetch(
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

// —— bu05 Automation hooks ——

// GET /api/automation/rules
export function useAutomationRules() {
  return useQuery<AutomationRule[]>({
    queryKey: ['automation-rules'],
    queryFn: async () => {
      const res = await fetch(`${API}/automation/rules`);
      if (!res.ok) throw new Error(await apiError(res, '加载自动化规则失败'));
      return res.json();
    },
  });
}

// POST /api/automation/rules
export function useCreateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAutomationRuleInput) => {
      const res = await fetch(`${API}/automation/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建规则失败'));
      return res.json() as Promise<AutomationRule>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      toastSuccess('规则已创建');
    },
    onError: (err) => toastError(errMessage(err, '创建规则失败')),
  });
}

// PATCH /api/automation/rules/:id
export function useUpdateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateAutomationRuleInput;
    }) => {
      const res = await fetch(`${API}/automation/rules/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '更新规则失败'));
      return res.json() as Promise<AutomationRule>;
    },
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      qc.invalidateQueries({ queryKey: ['automation-rules', rule.id] });
    },
    onError: (err) => toastError(errMessage(err, '更新规则失败')),
  });
}

// DELETE /api/automation/rules/:id
export function useDeleteAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/automation/rules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(await apiError(res, '删除规则失败'));
      }
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      qc.invalidateQueries({ queryKey: ['automation-runs', id] });
      toastSuccess('规则已删除');
    },
    onError: (err) => toastError(errMessage(err, '删除规则失败')),
  });
}

// POST /api/automation/rules/:id/run-now
// 注意：业务失败时 HTTP 仍为 201 + status=failed，不 throw；由调用方看 status toast
export function useRunAutomationNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `${API}/automation/rules/${encodeURIComponent(id)}/run-now`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await apiError(res, '立即执行失败'));
      return res.json() as Promise<AutomationRun>;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      qc.invalidateQueries({ queryKey: ['automation-runs', run.ruleId] });
      qc.invalidateQueries({ queryKey: ['issues'] });
      if (run.status === 'success') {
        const label = run.issueId ? run.issueId.slice(0, 8) : '—';
        toastSuccess(`已创建 Issue · ${label}…`, {
          action: run.issueId
            ? {
                label: '打开 Issue',
                href: `/issues/${run.issueId}`,
              }
            : {
                label: '看板 · 自动化',
                href: '/?origin=automation',
              },
          durationMs: 8000,
        });
      } else if (run.status === 'failed') {
        const err = run.error || '执行失败';
        const cwdish = /MA_WORKSPACE_CWD|cwd|工作区/i.test(err);
        toastError(err, {
          action: cwdish
            ? { label: '环境诊断', href: '/settings' }
            : { label: '看板 · 自动化', href: '/?origin=automation' },
          durationMs: 8000,
        });
      } else {
        toastSuccess(`已跳过（${run.status}）`);
      }
    },
    onError: (err) => toastError(errMessage(err, '立即执行失败')),
  });
}

// GET /api/automation/rules/:id/runs?limit=
export function useAutomationRuns(ruleId: string | null | undefined, limit = 10) {
  return useQuery<AutomationRun[]>({
    queryKey: ['automation-runs', ruleId, limit],
    queryFn: async () => {
      const res = await fetch(
        `${API}/automation/rules/${encodeURIComponent(ruleId!)}/runs?limit=${limit}`,
      );
      if (!res.ok) throw new Error(await apiError(res, '加载执行记录失败'));
      return res.json();
    },
    enabled: !!ruleId,
  });
}
