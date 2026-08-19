'use client';
/**
 * O3 拆分：runs 域 hooks（原 lib/api.ts 1187-1568 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  Issue,
  IssueRunUsage,
  AgentRun,
  RunTreeNode,
  RunMessage,
  RuntimesResponse,
  RuntimeId,
  RuntimeModelsResponse,
  PaginatedResponse,
} from '@ma/shared';
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastError, toastSuccess } from '../toast';

// —— S03 Run / Runtimes hooks ——

export function useRuntimes() {
  return useQuery<RuntimesResponse>({
    queryKey: ['runtimes'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/runtimes`);
      if (!res.ok) throw new Error('加载运行时失败');
      return res.json();
    },
  });
}

/** G22 续：CLI 发现 runtime 可选模型 */
export function useRuntimeModels(runtime: RuntimeId | '' | undefined) {
  return useQuery<RuntimeModelsResponse>({
    queryKey: ['runtime-models', runtime ?? ''],
    queryFn: async () => {
      const res = await apiFetch(`${API}/runtimes/${encodeURIComponent(runtime!)}/models`);
      if (!res.ok) throw new Error('加载模型列表失败');
      return res.json();
    },
    enabled: Boolean(runtime),
    staleTime: 60_000,
  });
}

export function useRuns(
  issueId: string,
  opts?: { refetchIntervalMs?: number | false; refetchActive?: boolean },
) {
  return useQuery<AgentRun[]>({
    queryKey: ['runs', issueId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/runs?issueId=${encodeURIComponent(issueId)}`);
      if (!res.ok) throw new Error('加载运行失败');
      const json = await res.json() as PaginatedResponse<AgentRun>;
      return json.data;
    },
    enabled: !!issueId,
    refetchInterval:
      opts?.refetchIntervalMs !== undefined
        ? opts.refetchIntervalMs
        : opts?.refetchActive
          ? (q) => {
              const rows = q.state.data ?? [];
              return rows.some(
                (run) =>
                  run.status === 'queued' ||
                  run.status === 'waiting_local_directory' ||
                  run.status === 'running',
              )
                ? 2500
                : false;
            }
          : false,
  });
}

export function useChildRuns(parentRunId: string, opts?: { refetchIntervalMs?: number | false }) {
  return useQuery<AgentRun[]>({
    queryKey: ['child-runs', parentRunId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/runs?parentRunId=${encodeURIComponent(parentRunId)}`);
      if (!res.ok) throw new Error('加载子运行失败');
      const json = await res.json() as PaginatedResponse<AgentRun>;
      return json.data;
    },
    enabled: !!parentRunId,
    refetchInterval: opts?.refetchIntervalMs ?? false,
  });
}

/** Bounded infrastructure auto-retry child for a failed source run. */
export function useAutoRetryChild(
  sourceRunId: string | undefined,
  opts?: { refetchIntervalMs?: number | false },
) {
  return useQuery<AgentRun | null>({
    queryKey: ['auto-retry-child', sourceRunId],
    queryFn: async () => {
      const res = await apiFetch(
        `${API}/runs?autoRetryOfRunId=${encodeURIComponent(sourceRunId!)}`,
      );
      if (!res.ok) throw new Error('鍔犺浇鑷姩閲嶈瘯澶辫触');
      const body = (await res.json()) as PaginatedResponse<AgentRun> | AgentRun[];
      const rows = Array.isArray(body) ? body : body.data;
      return rows[0] ?? null;
    },
    enabled: Boolean(sourceRunId),
    refetchInterval: opts?.refetchIntervalMs ?? false,
  });
}

/** GET /api/runs/:runId/tree —— S22 (S8): 获取 Run 的完整子代理层级树与摘要 */
export function useRunTree(runId: string | undefined, opts?: { refetchIntervalMs?: number | false }) {
  return useQuery<RunTreeNode>({
    queryKey: ['run-tree', runId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/runs/${encodeURIComponent(runId!)}/tree`);
      if (!res.ok) throw new Error(await apiError(res, '加载运行树失败'));
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: Boolean(runId),
    refetchInterval: opts?.refetchIntervalMs ?? false,
  });
}


/** GET /api/runs/:runId —— 运行详情页 */
export function useRun(runId: string | undefined) {
  return useQuery<AgentRun>({
    queryKey: ['run', runId],
    queryFn: async () => {
      const res = await apiFetch(`${API}/runs/${encodeURIComponent(runId!)}`);
      if (!res.ok) throw new Error(await apiError(res, '加载运行失败'));
      return res.json();
    },
    enabled: Boolean(runId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'running' ? 2000 : false;
    },
  });
}

/** G4：Issue 详情 run 用量摘要 */
export function useIssueRunUsage(issueId: string) {
  return useQuery<IssueRunUsage>({
    queryKey: ['issue-run-usage', issueId],
    queryFn: async () => {
      const res = await apiFetch(
        `${API}/issues/${encodeURIComponent(issueId)}/run-usage`,
      );
      if (!res.ok) throw new Error(await apiError(res, '加载用量失败'));
      return res.json();
    },
    enabled: !!issueId,
    staleTime: 10_000,
  });
}

/** 工作区级 runs 列表（issueId 可选） */
export function useWorkspaceRuns(params?: {
  status?: string;
  agentId?: string;
  squadId?: string;
  chatThreadId?: string;
  kind?: string;
  /** 仅小队 leader run */
  isLeader?: boolean;
  limit?: number;
  /** 聊天页在途轮询 */
  refetchIntervalMs?: number | false;
  /** 在途时轮询；无 active run 时自动停止 */
  refetchActive?: boolean;
  enabled?: boolean;
}) {
  const status = params?.status;
  const agentId = params?.agentId;
  const squadId = params?.squadId;
  const chatThreadId = params?.chatThreadId;
  const kind = params?.kind;
  const isLeader = params?.isLeader;
  const limit = params?.limit ?? 50;
  const refetchIntervalMs = params?.refetchIntervalMs;
  const refetchActive = params?.refetchActive ?? false;
  const enabled = params?.enabled ?? true;
  return useQuery<AgentRun[]>({
    queryKey: [
      'runs',
      'workspace',
      status ?? '',
      agentId ?? '',
      squadId ?? '',
      chatThreadId ?? '',
      kind ?? '',
      isLeader === undefined ? '' : isLeader ? '1' : '0',
      limit,
    ],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (status) sp.set('status', status);
      if (agentId) sp.set('agentId', agentId);
      if (squadId) sp.set('squadId', squadId);
      if (chatThreadId) sp.set('chatThreadId', chatThreadId);
      if (kind) sp.set('kind', kind);
      if (isLeader === true) sp.set('isLeader', '1');
      if (isLeader === false) sp.set('isLeader', '0');
      sp.set('limit', String(limit));
      const res = await apiFetch(`${API}/runs?${sp.toString()}`);
      if (!res.ok) throw new Error(await apiError(res, '加载运行列表失败'));
      // 服务端分页信封 { data, total, limit, offset }；兼容历史纯数组
      const body: unknown = await res.json();
      if (Array.isArray(body)) return body as AgentRun[];
      if (
        body &&
        typeof body === 'object' &&
        Array.isArray((body as { data?: unknown }).data)
      ) {
        return (body as { data: AgentRun[] }).data;
      }
      return [];
    },
    enabled,
    refetchInterval:
      refetchIntervalMs !== undefined
        ? refetchIntervalMs
        : refetchActive
          ? (q) => {
              const rows = q.state.data ?? [];
              return rows.some(
                (run) =>
                  run.status === 'queued' ||
                  run.status === 'waiting_local_directory' ||
                  run.status === 'running',
              )
                ? 2500
                : false;
            }
          : false,
  });
}

/** Slice 67：可选 forceFresh */
export type RetryRunVars = {
  runId: string;
  forceFresh?: boolean;
};

export function useRetryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: string | RetryRunVars) => {
      const runId = typeof vars === 'string' ? vars : vars.runId;
      const forceFresh = typeof vars === 'string' ? false : vars.forceFresh === true;
      const res = await apiFetch(`${API}/runs/${encodeURIComponent(runId)}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forceFresh ? { forceFresh: true } : {}),
      });
      if (!res.ok) throw new Error(await apiError(res, '再执行失败'));
      return res.json() as Promise<AgentRun>;
    },
    onSuccess: (run, variables) => {
      const runId = typeof variables === 'string' ? variables : variables.runId;
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
      qc.invalidateQueries({ queryKey: ['child-runs'] });
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
    mutationFn: async (body?: { runId?: string; forceFresh?: boolean }) => {
      const res = await apiFetch(`${API}/issues/${encodeURIComponent(issueId)}/rerun`, {
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

const RUN_MESSAGES_PAGE_SIZE = 500;

type RunMessagesCursor = { afterSeq: number } | { beforeSeq: number };

export function useRunMessages(
  runId: string | undefined,
  opts?: { refetchIntervalMs?: number | false },
) {
  const query = useInfiniteQuery<
    RunMessage[],
    Error,
    InfiniteData<RunMessage[]>,
    readonly ['run-messages', string | undefined],
    RunMessagesCursor | undefined
  >({
    queryKey: ['run-messages', runId] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(RUN_MESSAGES_PAGE_SIZE) });
      if (pageParam && 'afterSeq' in pageParam) {
        params.set('afterSeq', String(pageParam.afterSeq));
      } else if (pageParam && 'beforeSeq' in pageParam) {
        params.set('beforeSeq', String(pageParam.beforeSeq));
      }
      const res = await apiFetch(`${API}/runs/${runId}/messages?${params.toString()}`);
      if (!res.ok) throw new Error('加载轨迹失败');
      return res.json();
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < RUN_MESSAGES_PAGE_SIZE) return undefined;
      const seq = lastPage[lastPage.length - 1]?.seq;
      return seq === undefined ? undefined : { afterSeq: seq };
    },
    getPreviousPageParam: (firstPage) => {
      if (firstPage.length < RUN_MESSAGES_PAGE_SIZE) return undefined;
      const seq = firstPage[0]?.seq;
      return seq === undefined ? undefined : { beforeSeq: seq };
    },
    enabled: !!runId,
    refetchInterval:
      opts?.refetchIntervalMs === false
        ? false
        : opts?.refetchIntervalMs ?? false,
  });
  return {
    ...query,
    data: query.data?.pages.flat() ?? [],
    hasPreviousPage: query.hasPreviousPage,
    fetchPreviousPage: query.fetchPreviousPage,
    isFetchingPreviousPage: query.isFetchingPreviousPage,
  };
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiFetch(`${API}/runs/${runId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('取消失败');
      return res.json() as Promise<AgentRun>;
    },
    onSuccess: (run) => {
      if (run.issueId) {
        qc.invalidateQueries({ queryKey: ['runs', run.issueId] });
      }
      if (run.chatThreadId) {
        qc.invalidateQueries({ queryKey: ['chat-messages', run.chatThreadId] });
        qc.invalidateQueries({ queryKey: ['chat-threads'] });
      }
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['agent-runs', run.agentId] });
      qc.invalidateQueries({ queryKey: ['runs-active-count'] });
      const chatHref =
        run.kind === 'chat' && run.chatThreadId
          ? `/chat?thread=${encodeURIComponent(run.chatThreadId)}`
          : null;
      toastSuccess('已请求停止运行', {
        action: chatHref
          ? { label: '回会话', href: chatHref }
          : {
              label: '查看运行',
              href: `/runs?run=${encodeURIComponent(run.id)}&status=${encodeURIComponent(run.status || 'cancelled')}`,
            },
        durationMs: 7000,
      });
    },
    onError: (err) => toastError(errMessage(err, '取消失败')),
  });
}

/**
 * G1-1：POST /api/runs/:runId/command —— 运行中 RPC 命令（pi steer/compact/set_model）。
 * 仅 pi runtime 且 running 的 run 可用；其它情况服务端 409/501。
 */
export function useSendRunCommand(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      command: 'steer' | 'compact' | 'set_model';
      message?: string;
      customInstructions?: string;
      provider?: string;
      modelId?: string;
    }) => {
      const res = await apiFetch(`${API}/runs/${runId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '命令发送失败'));
      return res.json() as Promise<{ ok: true; command: string }>;
    },
    onSuccess: (result, input) => {
      const label =
        input.command === 'steer' ? '已推进运行' : input.command === 'compact' ? '已请求压缩会话' : '已请求切换模型';
      toastSuccess(label, { durationMs: 4000 });
      qc.invalidateQueries({ queryKey: ['runs', runId] });
    },
    onError: (err) => toastError(errMessage(err, '命令发送失败')),
  });
}

