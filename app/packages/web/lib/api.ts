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
  SkillInfo,
  SquadSummary,
  AgentRun,
  RunMessage,
  RuntimesResponse,
  WikiPage,
  WikiPageSummary,
  WikiQueryResult,
  WikiHealthResult,
  WikiLintResult,
  CreateWikiPageInput,
} from '@ma/shared';

const API = 'http://localhost:3001/api';

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
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
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['issues'], ctx.prevList);
      if (ctx?.prevOne) qc.setQueryData(['issue', id], ctx.prevOne);
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
      qc.invalidateQueries({ queryKey: ['runs', run.issueId] });
    },
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
      if (!res.ok) throw new Error('加载 agent 失败');
      return res.json();
    },
    enabled: !!id,
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
    },
  });
}
