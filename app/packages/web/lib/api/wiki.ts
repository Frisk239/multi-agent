'use client';
/**
 * O3 拆分：wiki 域 hooks（原 lib/api.ts 2187-2391 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  Issue,
  WikiPage,
  WikiPageSummary,
  WikiQueryResult,
  WikiHealthResult,
  WikiLintResult,
  WikiIngestJob,
  CreateWikiPageInput,
  PaginatedResponse,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastError, toastSuccess } from '../toast';

// —— S06 Wiki hooks + DS3 per-project root ——

function wikiProjectQs(projectId?: string | null): string {
  const pid = projectId?.trim();
  if (!pid) return '';
  return `projectId=${encodeURIComponent(pid)}`;
}

export type WikiMeta = {
  rootPath: string;
  workspacePath: string | null;
  source: 'project' | 'env' | 'workspace' | 'cwd' | string;
  workspaceCwdSource?: string;
  /** 能力开关：服务端支持按 project 分根（ADR 0005） */
  perProject: boolean;
  projectId?: string | null;
  note: string;
};

// GET /api/wiki/meta —— 根路径诚实（可选 ?projectId=）
export function useWikiMeta(projectId?: string | null) {
  const pid = projectId?.trim() || '';
  return useQuery<WikiMeta>({
    queryKey: ['wiki-meta', pid],
    queryFn: async () => {
      const qs = wikiProjectQs(pid);
      const res = await apiFetch(`${API}/wiki/meta${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('加载 wiki meta 失败');
      return res.json();
    },
    staleTime: 30_000,
  });
}

// GET /api/wiki/pages —— wiki 页列表（spec §6）
export function useWikiPages(projectId?: string | null) {
  const pid = projectId?.trim() || '';
  return useQuery<WikiPageSummary[]>({
    queryKey: ['wiki-pages', pid],
    queryFn: async () => {
      const qs = wikiProjectQs(pid);
      const res = await apiFetch(`${API}/wiki/pages${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('加载 wiki 失败');
      const json = await res.json() as PaginatedResponse<WikiPageSummary>;
      return json.data;
    },
  });
}

// GET /api/wiki/pages/:slug —— 单页内容（spec §6）
export function useWikiPage(slug: string | null, projectId?: string | null) {
  const pid = projectId?.trim() || '';
  return useQuery<WikiPage>({
    queryKey: ['wiki-page', slug, pid],
    queryFn: async () => {
      const qs = wikiProjectQs(pid);
      const res = await apiFetch(
        `${API}/wiki/pages/${encodeURIComponent(slug!)}${qs ? `?${qs}` : ''}`,
      );
      if (!res.ok) throw new Error('加载 wiki 页失败');
      return res.json();
    },
    enabled: !!slug,
  });
}

// —— S07 Wiki query / health / lint / 存回 hooks ——

// POST /api/wiki/query — 问答（spec §5.5）；可选 project 根；roots='all' 跨根检索（P2-3/B5）
export function useWikiQuery(projectId?: string | null, roots?: 'all') {
  const pid = projectId?.trim() || '';
  return useMutation({
    mutationFn: async (question: string) => {
      const qs = wikiProjectQs(pid);
      const res = await apiFetch(`${API}/wiki/query${qs ? `?${qs}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, ...(roots === 'all' ? { roots: 'all' } : {}) }),
      });
      if (!res.ok) throw new Error('查询失败');
      return res.json() as Promise<WikiQueryResult>;
    },
  });
}

// GET /api/wiki/health — 结构检查（手动触发，spec §5.5）
export function useWikiHealth(projectId?: string | null) {
  const pid = projectId?.trim() || '';
  return useQuery<WikiHealthResult>({
    queryKey: ['wiki-health', pid],
    queryFn: async () => {
      const qs = wikiProjectQs(pid);
      const res = await apiFetch(`${API}/wiki/health${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('检查失败');
      return res.json();
    },
    enabled: false, // 手动触发（refetch manually）
  });
}

// POST /api/wiki/lint — 语义检查（spec §5.5）
export function useWikiLint(projectId?: string | null) {
  const pid = projectId?.trim() || '';
  return useMutation({
    mutationFn: async () => {
      const qs = wikiProjectQs(pid);
      const res = await apiFetch(`${API}/wiki/lint${qs ? `?${qs}` : ''}`, {
        method: 'POST',
      });
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
      const res = await apiFetch(`${API}/wiki/jobs${qs ? `?${qs}` : ''}`);
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
      const res = await apiFetch(`${API}/wiki/jobs/${encodeURIComponent(jobId)}/retry`, {
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
      const res = await apiFetch(`${API}/wiki/jobs/retry-dead`, { method: 'POST' });
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

// POST /api/wiki/pages — 存回 wiki 页（spec §5.5）；可选 project 根
export function useCreateWikiPage(projectId?: string | null) {
  const qc = useQueryClient();
  const pid = projectId?.trim() || '';
  return useMutation({
    mutationFn: async (input: CreateWikiPageInput) => {
      const qs = wikiProjectQs(pid);
      const res = await apiFetch(`${API}/wiki/pages${qs ? `?${qs}` : ''}`, {
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

