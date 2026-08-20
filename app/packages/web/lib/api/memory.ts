'use client';
/**
 * O3 拆分：memory 域 hooks（原 lib/api.ts 2392-2879 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  SettingsStatusResponse,
  SettingsDiagnosticsResponse,
  SettingsLiveProbesResponse,
  OpsSnapshot,
  SnapshotEntry,
  SnapshotCreateResponse,
  SnapshotValidation,
  SnapshotDryRunResponse,
  SnapshotStageCreateResponse,
  SnapshotStageDeleteResponse,
  RestorePreviewResponse,
  UserProfile,
  UpdateUserProfileInput,
  PaginatedResponse,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastError, toastSuccess } from '../toast';

// —— S11 Memory hooks ——

export type MemoryStatus = {
  provider: string | null;
  available: boolean;
  backend?: string;
  perProject?: boolean;
  note?: string;
};

export type MemoryItem = {
  id: string;
  text: string;
  issueId?: string | null;
  projectId?: string | null;
  createdAt?: string;
  validAt?: string | null;
  invalidAt?: string | null;
  source?: string;
};

// GET /api/memory/status
export function useMemoryStatus() {
  return useQuery({
    queryKey: ['memory-status'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/memory/status`);
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
      const res = await apiFetch(`${API}/settings/status`);
      if (!res.ok) throw new Error('加载环境诊断失败');
      return res.json();
    },
    staleTime: 10_000,
  });
}

// GET /api/ops/snapshot —— Slice 51 运维快照
export function useOpsSnapshot(opts?: { refetchInterval?: number | false }) {
  return useQuery<OpsSnapshot>({
    queryKey: ['ops-snapshot'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/ops/snapshot`);
      if (!res.ok) throw new Error('加载运维快照失败');
      return res.json();
    },
    staleTime: 5_000,
    refetchInterval: opts?.refetchInterval ?? 10_000,
  });
}

export function useSnapshots(opts?: { refetchInterval?: number | false }) {
  return useQuery<{ success: true; dir: string; snapshots: SnapshotEntry[] }>({
    queryKey: ['ops-snapshots'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/ops/snapshots`);
      if (!res.ok) throw new Error(await apiError(res, '加载灾备快照失败'));
      return res.json();
    },
    staleTime: 5_000,
    refetchInterval: opts?.refetchInterval ?? false,
  });
}

export function useCreateSnapshot() {
  const qc = useQueryClient();
  return useMutation<SnapshotCreateResponse, Error, void>({
    mutationFn: async () => {
      const res = await apiFetch(`${API}/ops/snapshots`, { method: 'POST' });
      if (!res.ok) throw new Error(await apiError(res, '创建灾备快照失败'));
      return res.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ops-snapshots'] }); toastSuccess('灾备快照已创建'); },
    onError: (err) => toastError(errMessage(err, '创建灾备快照失败')),
  });
}

export function useValidateSnapshot() {
  return useMutation<SnapshotValidation, Error, { name: string }>({
    mutationFn: async ({ name }) => {
      const res = await apiFetch(`${API}/ops/snapshots/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok && res.status >= 500) throw new Error(await apiError(res, '校验灾备快照失败'));
      return res.json();
    },
    onError: (err) => toastError(errMessage(err, '校验灾备快照失败')),
  });
}

export function useDryRunSnapshotRestore() {
  return useMutation<SnapshotDryRunResponse, Error, { name: string }>({
    mutationFn: async ({ name }) => {
      const res = await apiFetch(`${API}/ops/snapshots/dry-run-restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok && res.status >= 500) throw new Error(await apiError(res, '生成恢复演练报告失败'));
      return res.json();
    },
    onError: (err) => toastError(errMessage(err, '生成恢复演练报告失败')),
  });
}

export function useStageSnapshotRestore() {
  return useMutation<SnapshotStageCreateResponse, Error, { name: string }>({
    mutationFn: async ({ name }) => {
      const res = await apiFetch(`${API}/ops/snapshots/stage-restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await apiError(res, '准备隔离恢复包失败'));
      return res.json();
    },
    onError: (err) => toastError(errMessage(err, '准备隔离恢复包失败')),
  });
}

export function useDeleteSnapshotStage() {
  return useMutation<SnapshotStageDeleteResponse, Error, { stageId: string }>({
    mutationFn: async ({ stageId }) => {
      const res = await apiFetch(`${API}/ops/snapshot-stages/${encodeURIComponent(stageId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await apiError(res, '清理隔离恢复包失败'));
      return res.json();
    },
    onError: (err) => toastError(errMessage(err, '清理隔离恢复包失败')),
  });
}

export function usePreviewSnapshotRestore() {
  return useMutation<RestorePreviewResponse, Error, { stageId: string }>({
    mutationFn: async ({ stageId }) => {
      const res = await apiFetch(`${API}/ops/snapshot-restores/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error(await apiError(res, '生成恢复影响预览失败'));
      return res.json();
    },
    onError: (err) => toastError(errMessage(err, '生成恢复影响预览失败')),
  });
}

export function useConfirmSnapshotRestore() {
  return useMutation<
    { success: boolean; error?: string; journal: RestorePreviewResponse['journal'] },
    Error,
    { journalId: string; confirmationToken: string; confirmationPhrase: string }
  >({
    mutationFn: async (body) => {
      const res = await apiFetch(`${API}/ops/snapshot-restores/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(data.error ?? '确认恢复失败');
      return data;
    },
    onSuccess: (data) => {
      if (data.success) toastSuccess('恢复已应用');
      else toastError(data.error ?? '恢复未应用');
    },
    onError: (err) => toastError(errMessage(err, '确认恢复失败')),
  });
}

/**
 * G8-3：旧 Agent 配置中的敏感字面量扫描。
 *
 * 服务端的 finding 只会返回定位元数据、长度与短指纹，永不包含原始值；
 * 前端也不尝试从该响应推断或保存密钥。
 */
export type SecretSafetyStatus =
  | 'known_legacy_literals_detected'
  | 'no_known_legacy_literals'
  | 'scan_inconclusive';

export type SecretSafetyFinding = {
  agentId: string;
  field: 'envVars' | 'mcpServers';
  path: string;
  key: string;
  length: number;
  fingerprint: string;
};

export type SecretSafetySummary = {
  status: SecretSafetyStatus;
  remediation: string;
  findings: SecretSafetyFinding[];
};

export type SecretSafetyScanResponse = {
  success: true;
  summary: SecretSafetySummary;
  applied?: boolean;
  updatedAgents?: number;
  after?: Omit<SecretSafetySummary, 'findings'>;
};

export function useSecretSafetyScan() {
  return useMutation<SecretSafetyScanResponse, Error, void>({
    mutationFn: async () => {
      const res = await apiFetch(`${API}/ops/secret-safety/scan`, { method: 'POST' });
      if (!res.ok) throw new Error(await apiError(res, '扫描历史密钥配置失败'));
      return res.json();
    },
    onError: (err) => toastError(errMessage(err, '扫描历史密钥配置失败')),
  });
}

export function useApplySecretSafety() {
  const qc = useQueryClient();
  return useMutation<
    SecretSafetyScanResponse,
    Error,
    { confirmation: 'CLEAN_LEGACY_SECRET_LITERALS' }
  >({
    mutationFn: async (body) => {
      const res = await apiFetch(`${API}/ops/secret-safety/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await apiError(res, '清理历史密钥配置失败'));
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops-snapshots'] });
      toastSuccess('历史敏感字面量已清理；请为需要的配置补填 envRef');
    },
    onError: (err) => toastError(errMessage(err, '清理历史密钥配置失败')),
  });
}

// GET /api/settings/live-probes —— Slice 51 真实 runtime/在途探针
export function useSettingsLiveProbes(opts?: { refetchInterval?: number | false }) {
  return useQuery<SettingsLiveProbesResponse>({
    queryKey: ['settings-live-probes'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/settings/live-probes`);
      if (!res.ok) throw new Error('加载活体探针失败');
      return res.json();
    },
    staleTime: 3_000,
    refetchInterval: opts?.refetchInterval ?? 5_000,
  });
}

// GET /api/settings/diagnostics —— Slice 18 CLI & 环境深度诊断
export function useSettingsDiagnostics() {
  return useQuery<SettingsDiagnosticsResponse>({
    queryKey: ['settings-diagnostics'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/settings/diagnostics`);
      if (!res.ok) throw new Error('加载 CLI 进程与环境诊断失败');
      return res.json();
    },
    staleTime: 5_000,
  });
}

/** GET /api/profile —— 本地用户 About */
export function useUserProfile() {
  return useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/profile`);
      if (!res.ok) throw new Error(await apiError(res, '加载用户资料失败'));
      return res.json();
    },
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateUserProfileInput) => {
      const res = await apiFetch(`${API}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '保存用户资料失败'));
      return res.json() as Promise<UserProfile>;
    },
    onSuccess: (profile) => {
      qc.setQueryData(['profile'], profile);
      toastSuccess('已保存「关于你」');
    },
    onError: (err) => toastError(errMessage(err, '保存用户资料失败')),
  });
}

export type IsolatedWorkspaceEntry = {
  id: string;
  kind: 'run_workspace' | 'chat_session';
  path: string;
  label: string;
  mtimeMs: number;
};

export type InboxPrefs = {
  notifyIssueSuccess: boolean;
  notifyTypes?: {
    comment?: boolean;
    run_completed?: boolean;
    run_failed?: boolean;
    assigned?: boolean;
  };
  notifySeverities?: {
    action_required?: boolean;
    attention?: boolean;
    info?: boolean;
  };
  envForcesSuccess?: boolean;
  effectiveNotifyIssueSuccess?: boolean;
  /** Slice 70：opt-in deferred 升级（默认 false） */
  deferredAutoEscalate?: boolean;
  envForcesDeferredAutoEscalate?: boolean;
  effectiveDeferredAutoEscalate?: boolean;
  effectiveDeferredUnclaimedMs?: number;
  suggestedDeferredUnclaimedMs?: number;
  /** G5-5：系统/桌面通知开关（run 终态 + inbox 新项 → Windows 弹窗；默认关） */
  systemNotifications?: boolean;
};

/** GET/PUT /api/settings/inbox-prefs */
export function useInboxPrefs() {
  return useQuery({
    queryKey: ['inbox-prefs'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/settings/inbox-prefs`);
      if (!res.ok) throw new Error(await apiError(res, '加载通知偏好失败'));
      return res.json() as Promise<InboxPrefs>;
    },
    staleTime: 15_000,
  });
}

export function useSetInboxPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<InboxPrefs>) => {
      const res = await apiFetch(`${API}/settings/inbox-prefs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '保存通知偏好失败'));
      return res.json() as Promise<InboxPrefs & { ok: true }>;
    },
    onSuccess: (data) => {
      qc.setQueryData(['inbox-prefs'], data);
      toastSuccess('已保存通知偏好');
    },
    onError: (err) => toastError(errMessage(err, '保存通知偏好失败')),
  });
}

/** GET /api/settings/isolated-workspaces */
export function useIsolatedWorkspaces() {
  return useQuery({
    queryKey: ['isolated-workspaces'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/settings/isolated-workspaces`);
      if (!res.ok) throw new Error(await apiError(res, '加载隔离目录失败'));
      return res.json() as Promise<{
        rootHint: string;
        count: number;
        entries: IsolatedWorkspaceEntry[];
      }>;
    },
    staleTime: 15_000,
  });
}

/** POST /api/settings/isolated-workspaces/cleanup */
export function useCleanupIsolatedWorkspaces() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids?: string[]; olderThanDays?: number }) => {
      const res = await apiFetch(`${API}/settings/isolated-workspaces/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '清理隔离目录失败'));
      return res.json() as Promise<{
        ok: true;
        deleted: string[];
        skipped: string[];
        errors: string[];
      }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['isolated-workspaces'] });
      toastSuccess(
        `已清理 ${data.deleted.length} 个隔离目录` +
          (data.errors.length ? ` · ${data.errors.length} 失败` : ''),
      );
    },
    onError: (err) => toastError(errMessage(err, '清理隔离目录失败')),
  });
}

/** POST /api/settings/workspace-cwd —— 持久化本机工作区路径（G2-5：可选 maxConcurrentRuns 全局配额） */
export function useSetWorkspaceCwd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { path: string; maxConcurrentRuns?: number | null }) => {
      const res = await apiFetch(`${API}/settings/workspace-cwd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '保存工作区设置失败'));
      return res.json() as Promise<{
        ok: true;
        cwd: {
          path: string | null;
          source: string;
          exists: boolean;
          configured: boolean;
          persistedPath: string | null;
        };
        maxConcurrentRuns?: number | null;
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

// GET /api/memory?q=&scope= — 空 q 为最近 N 条；G4-4：可选 scope 过滤
// projectId 三态：undefined=全量、null=仅全局、ID=该项目+全局（服务端同语义）。
// queryKey 必须区分三态——若 undefined/null 都折为 '' 会串缓存（项目筛选切档读到脏数据）。
const PROJECT_FILTER_ALL = '__all__';
const PROJECT_FILTER_GLOBAL_ONLY = '__global__';

export function memoryProjectFilterKey(projectId: string | null | undefined): string {
  if (projectId === undefined) return PROJECT_FILTER_ALL;
  if (projectId === null) return PROJECT_FILTER_GLOBAL_ONLY;
  return projectId;
}

export function useMemoryList(q: string, scope?: string, projectId?: string | null) {
  return useQuery({
    queryKey: ['memory', q, scope ?? '', memoryProjectFilterKey(projectId)],
    queryFn: async () => {
      const params = new URLSearchParams({ includeInvalid: '1' });
      if (q.trim()) params.set('q', q.trim());
      if (scope) params.set('scope', scope);
      if (projectId !== undefined) params.set('projectId', projectId ?? '');
      const res = await apiFetch(`${API}/memory?${params.toString()}`);
      if (!res.ok) throw new Error('加载记忆失败');
      type MemoryItem = any; // fallback if MemoryItem is not cleanly importable, though it should be already imported if used
      const json = await res.json() as PaginatedResponse<any>;
      return json.data;
    },
    // G7-3：Memory 页活性诚实——15s 轮询，完成 issue 的 ambient 记忆 15s 内可见。
    // 服务端无 memory WS 广播（lib/ws.ts 无 memory topic），轮询为最小诚实路径；
    // 有查询词时仍保持轮询（FTS 结果也随库增长更新）。
    refetchInterval: 15_000,
  });
}

/** GET /api/memory/:id — 单条全文详情 */
export function useMemoryItem(id: string | undefined) {
  return useQuery({
    queryKey: ['memory-item', id],
    queryFn: async () => {
      const res = await apiFetch(`${API}/memory/${encodeURIComponent(id!)}`);
      if (!res.ok) throw new Error(await apiError(res, '加载记忆详情失败'));
      return res.json() as Promise<MemoryItem>;
    },
    enabled: Boolean(id),
  });
}

// POST /api/memory — curated 写入（G4-4：可带 scope）
export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      text: string;
      issueId?: string;
      projectId?: string | null;
      scope?: string;
    }) => {
      const res = await apiFetch(`${API}/memory`, {
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
      const res = await apiFetch(`${API}/memory/${encodeURIComponent(id)}`, {
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
      const res = await apiFetch(`${API}/memory/delete-many`, {
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

