'use client';
/**
 * O3 拆分：API 传输基础（apiFetch + 错误处理 + issues 查询参数）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import { toastError } from '../toast';
import { withLocalTokenHeaders } from '../local-token';
import type {
  Issue,
  IssueEnqueueMeta,
} from '@ma/shared';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Slice 59：统一带 local token 的 fetch（X-MA-Token from NEXT_PUBLIC_MA_LOCAL_TOKEN） */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withLocalTokenHeaders(init?.headers),
  });
}

/** Issue 写接口可能附带 enqueue 元数据（指派成功但可能未开工） */
export type IssueWithEnqueue = Issue & { enqueue?: IssueEnqueueMeta };

export function errMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Slice2 / B3：enqueue 硬闸/跳过 → 可行动 toast + 恢复链接 */
export function toastEnqueueMeta(issueId: string, enqueue?: IssueEnqueueMeta | null) {
  if (!enqueue || enqueue.status !== 'skipped') return;
  const reason = enqueue.reason;
  let href = `/issues/${issueId}`;
  let label = '打开 Issue';
  if (reason === 'cwd_missing') {
    href = '/settings';
    label = '保存工作区';
  } else if (reason === 'runtime_missing') {
    href = '/runtimes';
    label = '运行时探测';
  } else if (reason === 'readiness_error') {
    href = '/settings';
    label = '环境诊断';
  } else if (reason === 'already_active') {
    href = `/runs?issueId=${encodeURIComponent(issueId)}`;
    label = '查看运行';
  } else if (reason === 'no_leader') {
    href = '/squads';
    label = '小队列表';
  }
  toastError(enqueue.detail ?? '未开工：派发被跳过', {
    action: { label, href },
    durationMs: 8000,
  });
}

export async function apiError(res: Response, fallback: string): Promise<string> {
  let body: any;
  try {
    body = await res.json();
  } catch {
    return fallback;
  }
  if (body?.code === 'readiness_failed' && body?.reason && typeof body?.error === 'string') {
    const e = new Error(body.error) as any;
    e.code = body.code;
    e.reason = body.reason;
    throw e;
  }
  if (typeof body?.error === 'string' && body.error) return body.error;
  return fallback;
}

export type IssuesQuery = {
  q?: string;
  labelId?: string;
  status?: string;
  priority?: string;
  /** automation | quick_create */
  originType?: 'automation' | 'quick_create';
  /** projects-mvp */
  projectId?: string;
  /** agent | squad — 须与 assigneeId 成对 */
  assigneeType?: 'agent' | 'squad';
  assigneeId?: string;
  /** 仅未指派 */
  unassigned?: boolean;
  /** 任一 agent/squad 指派（侧栏「我的 issue」） */
  assigned?: boolean;
  /** DS2：manual | updated */
  sort?: 'manual' | 'updated';
  limit?: number;
  offset?: number;
};

export function issuesQueryKey(params?: IssuesQuery) {
  return [
    'issues',
    params?.q?.trim() || '',
    params?.labelId || '',
    params?.status || '',
    params?.priority || '',
    params?.originType || '',
    params?.projectId || '',
    params?.assigneeType || '',
    params?.assigneeId || '',
    params?.unassigned ? '1' : '',
    params?.assigned ? '1' : '',
    params?.sort || '',
    params?.limit || 0,
    params?.offset || 0,
  ] as const;
}

export function buildIssuesUrl(params?: IssuesQuery) {
  const sp = new URLSearchParams();
  if (params?.q?.trim()) sp.set('q', params.q.trim());
  if (params?.labelId) sp.set('labelId', params.labelId);
  if (params?.status) sp.set('status', params.status);
  if (params?.priority) sp.set('priority', params.priority);
  if (params?.originType) sp.set('originType', params.originType);
  if (params?.projectId) sp.set('projectId', params.projectId);
  if (params?.assigneeType && params?.assigneeId) {
    sp.set('assigneeType', params.assigneeType);
    sp.set('assigneeId', params.assigneeId);
  }
  if (params?.unassigned) sp.set('unassigned', '1');
  if (params?.assigned) sp.set('assigned', '1');
  if (params?.sort) sp.set('sort', params.sort);
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.offset) sp.set('offset', params.offset.toString());
  const qs = sp.toString();
  return qs ? `${API}/issues?${qs}` : `${API}/issues`;
}

