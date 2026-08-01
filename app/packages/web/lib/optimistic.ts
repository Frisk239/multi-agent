import type { QueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '@ma/shared';
import { toastError } from './toast';

/**
 * —— 乐观更新通用辅助（W2：高频 mutation 扩面）——
 *
 * 模式提炼自 api.ts 既有 3 处 onMutate（reorder / updateIssue / deleteIssue）：
 *   cancelQueries → 读快照 → 本地 patch → onError 回滚（restore 快照）+ toast「已还原」
 *   → onSettled invalidate（以 server 回灌为准）。
 *
 * ── 与 ws.ts 的幂等约定（同 key 同 shape）──
 * - 列表 key 统一走 `['issues']` 前缀的 **fuzzy** 匹配（setQueriesData/getQueriesData），
 *   与 useReorderIssues 同模式，覆盖全部筛选/搜索/分页列表变体。
 * - patch 是**行级按 id 幂等替换**：每条行都保持完整 Issue 形状（status / assignee /
 *   position / updatedAt 原地改），与 server 回灌结果同 shape —— WS issue:updated 回灌
 *   （setQueryData(['issues'])）或 invalidate 后 refetch 都是「按 id 覆盖」，先后到达不叠加、不打架。
 * - WS 是事实源：乐观值只是占位，WS 事件 / refetch 到达后一律以它们为准。
 * - 指派乐观只带 {type, id} + label 占位 ''（UpdateIssueInput 无 label，完整 label 由
 *   server 响应回填）；请勿在乐观层伪造 label，否则会与回灌形状不一致。
 */
export type OptimisticContext = { snapshot: Map<string, unknown> };

function errMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

// ───────────────────────── 纯函数（可单测）─────────────────────────

/**
 * 兼容三种 issue 缓存形状的行级变换：
 * - `PaginatedResponse<Issue>`（useIssues 的信封，含 data/total/limit/offset）
 * - `Issue[]`（ws.ts 对精确 `['issues']` key 的数组形状；当前无查询使用，防御性兼容）
 * - `Issue` 单实体（['issue', id] 详情）
 * null/undefined 原样返回（无缓存时 no-op，保证 setQueriesData 不误建缓存）。
 */
export function mapIssueRows<T extends { id: string }>(
  old: unknown,
  fn: (row: T) => T,
): unknown {
  if (!old) return old;
  if (Array.isArray(old)) return old.map(fn);
  if (Array.isArray((old as { data?: unknown }).data)) {
    const env = old as PaginatedResponse<T>;
    return { ...env, data: env.data.map(fn) };
  }
  return fn(old as T);
}

/**
 * 行级删除：从数组/信封中按 id 移除；单实体不做处理
 * （详情缓存删除走 removeQueries，见 useBulkDeleteIssues 的 afterMutate）。
 */
export function removeIssueRows<T extends { id: string }>(
  old: unknown,
  ids: ReadonlySet<string>,
): unknown {
  if (!old) return old;
  const keep = (row: T) => !ids.has(row.id);
  if (Array.isArray(old)) return old.filter(keep);
  if (Array.isArray((old as { data?: unknown }).data)) {
    const env = old as PaginatedResponse<T>;
    return { ...env, data: env.data.filter(keep) };
  }
  return old;
}

// ───────────────────────── RQ 胶水（薄层）─────────────────────────

/** 对每个 key 前缀做 fuzzy 匹配，快照「有数据」的缓存（pending/无数据的不快照也不 patch）。 */
export function snapshotQueries(
  qc: QueryClient,
  queryKeys: readonly (readonly unknown[])[],
): Map<string, unknown> {
  const snapshot = new Map<string, unknown>();
  for (const key of queryKeys) {
    for (const [matchedKey, data] of qc.getQueriesData({ queryKey: key })) {
      if (data !== undefined) snapshot.set(JSON.stringify(matchedKey), data);
    }
  }
  return snapshot;
}

/** 对每个 key 前缀 fuzzy 应用本地 patch（返回 undefined 表示该缓存不变）。 */
export function applyPatches<TVars>(
  qc: QueryClient,
  queryKeys: readonly (readonly unknown[])[],
  vars: TVars,
  apply: (vars: TVars, old: unknown) => unknown,
): void {
  for (const key of queryKeys) {
    qc.setQueriesData({ queryKey: key }, (old) => apply(vars, old));
  }
}

/** 回滚：把快照里的值原样写回（多 key 相互隔离，互不影响）。 */
export function rollbackQueries(qc: QueryClient, snapshot: Map<string, unknown>): void {
  for (const [keyStr, data] of snapshot) {
    qc.setQueryData(JSON.parse(keyStr) as readonly unknown[], data);
  }
}

export async function optimisticOnMutate<TVars>(
  qc: QueryClient,
  vars: TVars,
  opts: {
    queryKeys: (vars: TVars) => readonly (readonly unknown[])[];
    apply: (vars: TVars, old: unknown) => unknown;
    /** onMutate 后置钩子（如 bulk-delete 移除详情缓存） */
    afterMutate?: (vars: TVars) => void;
  },
): Promise<OptimisticContext> {
  const queryKeys = opts.queryKeys(vars);
  for (const key of queryKeys) {
    await qc.cancelQueries({ queryKey: key });
  }
  const snapshot = snapshotQueries(qc, queryKeys);
  applyPatches(qc, queryKeys, vars, opts.apply);
  opts.afterMutate?.(vars);
  return { snapshot };
}

/**
 * 生成 useMutation 的 onMutate / onError / onSettled 三件套：
 * - onMutate：cancel → 快照 → patch（含 afterMutate）
 * - onError：restore 快照 + toast「${errMessage(err, fallbackMessage)}，已还原」（回滚可见，不静默）
 * - onSettled：invalidate invalidateKeys 前缀（成功/失败都刷，失败时以 refetch 的 server 真值为准）
 */
export function optimisticOptions<TVars>(opts: {
  queryClient: QueryClient;
  queryKeys: (vars: TVars) => readonly (readonly unknown[])[];
  apply: (vars: TVars, old: unknown) => unknown;
  invalidateKeys?: readonly (readonly unknown[])[];
  /** 失败 toast 的兜底文案；实际文案为 `${errMessage(err, fallbackMessage)}，已还原` */
  fallbackMessage: string;
  afterMutate?: (vars: TVars) => void;
}) {
  const qc = opts.queryClient;
  return {
    onMutate: (vars: TVars) =>
      optimisticOnMutate(qc, vars, {
        queryKeys: opts.queryKeys,
        apply: opts.apply,
        afterMutate: opts.afterMutate,
      }),
    onError: (err: unknown, _vars: TVars, ctx: OptimisticContext | undefined) => {
      if (ctx) rollbackQueries(qc, ctx.snapshot);
      toastError(`${errMessage(err, opts.fallbackMessage)}，已还原`);
    },
    onSettled: () => {
      for (const key of opts.invalidateKeys ?? []) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  };
}
