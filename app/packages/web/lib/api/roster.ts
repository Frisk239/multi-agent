'use client';
/**
 * O3 拆分：roster 域 hooks（原 lib/api.ts 1721-2186 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  AgentDetail,
  AgentReadiness,
  AgentWorkStats,
  WorkspaceUsage,
  CreateAgentInput,
  UpdateAgentInput,
  CreateSquadInput,
  UpdateSquadInput,
  SquadDetail,
  AgentRun,
  OpsAnalyticsResponse,
  AgentTemplate,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastError, toastSuccess } from '../toast';

export function useAgent(id: string) {
  return useQuery<AgentDetail | null>({
    queryKey: ['agent', id],
    queryFn: async () => {
      const res = await apiFetch(`${API}/agents/${id}`);
      if (!res.ok) throw new Error(await apiError(res, '加载 agent 失败'));
      return res.json();
    },
    enabled: !!id,
  });
}

// —— bu02 Agent / Squad 运营 hooks ——

// Slice 30：Agent 模板库
export function useAgentTemplates() {
  return useQuery<AgentTemplate[]>({
    queryKey: ['agent-templates'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/agent-templates`);
      if (!res.ok) throw new Error(await apiError(res, '加载 Agent 模板失败'));
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useCreateAgentFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      overrides?: Partial<
        Pick<
          CreateAgentInput,
          | 'name'
          | 'runtime'
          | 'model'
          | 'thinkingLevel'
          | 'category'
          | 'concurrency'
          | 'instructions'
          | 'allowedPaths'
          | 'mcpServers'
          | 'id'
        >
      >;
    }) => {
      const res = await apiFetch(
        `${API}/agent-templates/${encodeURIComponent(input.templateId)}/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input.overrides ?? {}),
        },
      );
      if (!res.ok) throw new Error(await apiError(res, '从模板创建智能体失败'));
      return res.json() as Promise<AgentDetail>;
    },
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.setQueryData(['agent', agent.id], agent);
      toastSuccess(`已从模板创建 ${agent.name}`, {
        action: { label: '打开', href: `/agents/${agent.id}` },
        durationMs: 6000,
      });
    },
    onError: (err) => toastError(errMessage(err, '从模板创建智能体失败')),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAgentInput) => {
      const res = await apiFetch(`${API}/agents`, {
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
      const res = await apiFetch(`${API}/agents/${agentId}`, {
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

/** G25：默认软归档；hard=true 才硬删 */
export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentId: string | { id: string; hard?: boolean }) => {
      const id = typeof agentId === 'string' ? agentId : agentId.id;
      const hard = typeof agentId === 'string' ? false : Boolean(agentId.hard);
      const qs = hard ? '?hard=1' : '';
      const res = await apiFetch(`${API}/agents/${id}${qs}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await apiError(res, hard ? '删除智能体失败' : '归档智能体失败'));
      return { id, hard };
    },
    onSuccess: ({ id, hard }) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      if (hard) {
        qc.removeQueries({ queryKey: ['agent', id] });
        qc.removeQueries({ queryKey: ['agent-readiness', id] });
        qc.removeQueries({ queryKey: ['agent-runs', id] });
        toastSuccess('已删除智能体');
      } else {
        qc.invalidateQueries({ queryKey: ['agent', id] });
        toastSuccess('已归档智能体');
      }
    },
    onError: (err) => toastError(errMessage(err, '归档/删除智能体失败')),
  });
}

export function useUnarchiveAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiFetch(`${API}/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) throw new Error(await apiError(res, '取消归档失败'));
      return res.json() as Promise<AgentDetail>;
    },
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.setQueryData(['agent', agent.id], agent);
      toastSuccess('已恢复智能体');
    },
    onError: (err) => toastError(errMessage(err, '取消归档失败')),
  });
}

export function useAgentReadiness(agentId: string) {
  return useQuery<AgentReadiness>({
    queryKey: ['agent-readiness', agentId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/agents/${agentId}/readiness`);
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
      const res = await apiFetch(`${API}/runs/cancel-many`, {
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
      const res = await apiFetch(`${API}/runs/recover-stuck`, { method: 'POST' });
      if (!res.ok) throw new Error(await apiError(res, '收尸失败'));
      return res.json() as Promise<{
        orphanRunning: number;
        staleRunning: number;
        staleQueued: number;
        missingAgentQueued: number;
        staleWaitingLocal?: number;
        /** Slice 68：过期 prepare lease 半 claim */
        stalePrepareLease?: number;
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
        const waitingPart =
          typeof r.staleWaitingLocal === 'number' && r.staleWaitingLocal > 0
            ? ` · 目录等待超时 ${r.staleWaitingLocal}`
            : '';
        const leasePart =
          typeof r.stalePrepareLease === 'number' && r.stalePrepareLease > 0
            ? ` · prepare租约 ${r.stalePrepareLease}`
            : '';
        toastSuccess(
          `已收尸 ${r.total} 条（running残留 ${r.orphanRunning} · 心跳超时 ${r.staleRunning} · 缺 agent ${r.missingAgentQueued} · 排队过久 ${r.staleQueued}${waitingPart}${leasePart}）`,
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
      const res = await apiFetch(`${API}/agents/readiness?ids=${qs}`);
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
      const res = await apiFetch(
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
      const res = await apiFetch(
        `${API}/agents/${encodeURIComponent(agentId)}/work-stats?days=${encodeURIComponent(daysKey)}`,
      );
      if (!res.ok) throw new Error(await apiError(res, '加载工作统计失败'));
      return res.json();
    },
    enabled: !!agentId,
    staleTime: 15_000,
  });
}

/** G17：工作区用量中心 */
export function useWorkspaceUsage(days = 30) {
  return useQuery<WorkspaceUsage>({
    queryKey: ['workspace-usage', days],
    queryFn: async () => {
      const res = await apiFetch(`${API}/usage?days=${encodeURIComponent(String(days))}`);
      if (!res.ok) throw new Error(await apiError(res, '加载用量失败'));
      return res.json();
    },
    staleTime: 15_000,
  });
}

/** G5-6：GET /api/analytics/ops?days=N —— 运营统计（cycle time / 利用率 / 失败率·改派趋势） */
export function useOpsAnalytics(days = 30) {
  return useQuery<OpsAnalyticsResponse>({
    queryKey: ['ops-analytics', days],
    queryFn: async () => {
      const res = await apiFetch(`${API}/analytics/ops?days=${encodeURIComponent(String(days))}`);
      if (!res.ok) throw new Error(await apiError(res, '加载运营统计失败'));
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useCreateSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSquadInput) => {
      const res = await apiFetch(`${API}/squads`, {
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
      const res = await apiFetch(`${API}/squads/${squadId}`, {
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
      const res = await apiFetch(`${API}/squads/${squadId}`, { method: 'DELETE' });
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
      const res = await apiFetch(`${API}/agents/${agentId}/skills`);
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
      const res = await apiFetch(`${API}/agents/${agentId}/skills`, {
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
      const res = await apiFetch(`${API}/agents/${agentId}/mcp`);
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
      const res = await apiFetch(`${API}/agents/${agentId}/mcp`, {
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

