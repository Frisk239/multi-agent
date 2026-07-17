'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Issue,
  Comment,
  CreateIssueInput,
  UpdateIssueInput,
  CreateCommentInput,
  AgentSummary,
  AgentDetail,
  AgentReadiness,
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
  CreateWikiPageInput,
  CreateQuickRunInput,
  SettingsStatusResponse,
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

export function useIssues() {
  return useQuery<Issue[]>({
    queryKey: ['issues'],
    queryFn: async () => {
      const res = await fetch(`${API}/issues`);
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
      toastSuccess(`已创建 ${issue.identifier}`);
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
      return res.json() as Promise<Comment>;
    },
    // R9：不做乐观插入；写入 cache + 依赖 WS 幂等
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(['comments', issueId], (old) => {
        if (!old) return [comment];
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
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
      qc.setQueryData<Issue[]>(['issues'], (old) =>
        old?.map((i) => (i.id === issue.id ? issue : i)),
      );
      qc.setQueryData<Issue>(['issue', issue.id], issue);
      // 时间线条等 WS comment:created；也可 invalidate 兜底
      qc.invalidateQueries({ queryKey: ['comments', issue.id] });
    },
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
      qc.invalidateQueries({ queryKey: ['agent-runs', run.agentId] });
      toastSuccess('已请求停止运行');
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
      toastSuccess(`已创建 ${agent.name}`);
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
      toastSuccess(`已创建 ${squad.name}`);
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
      toastSuccess('已派出快速派活任务');
      qc.invalidateQueries({ queryKey: ['agent-runs'] });
      if (data.run.agentId) {
        qc.invalidateQueries({ queryKey: ['agent-runs', data.run.agentId] });
      }
    },
    onError: (err) => toastError(errMessage(err, '快速派活失败')),
  });
}
