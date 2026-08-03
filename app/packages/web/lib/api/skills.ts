'use client';
/**
 * O3 拆分：skills 域 hooks（原 lib/api.ts 1569-1720 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  SkillInfo,
  ScanLocalSkillsResponse,
  ImportLocalSkillsInput,
  ImportLocalSkillsResponse,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastError, toastSuccess } from '../toast';

// —— S05 Skills / MCP hooks ——

// GET /api/skills —— 内存索引 skill 列表（含 usedBy 反查）
export function useSkills() {
  return useQuery<SkillInfo[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/skills`);
      if (!res.ok) throw new Error('加载 skills 失败');
      return res.json();
    },
  });
}

/** GET /api/skills/:name —— Multica 式详情 */
export function useSkill(name: string | undefined) {
  return useQuery({
    queryKey: ['skill', name],
    queryFn: async () => {
      const res = await apiFetch(`${API}/skills/${encodeURIComponent(name!)}`);
      if (!res.ok) throw new Error(await apiError(res, '加载 skill 失败'));
      return res.json() as Promise<{
        name: string;
        description: string;
        source: 'project' | 'user';
        body: string;
        path: string;
        usedBy: { id: string; name: string; runtime: string }[];
      }>;
    },
    enabled: Boolean(name),
  });
}

// POST /api/skills/refresh —— 重扫目录刷新索引
export function useRefreshSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API}/skills/refresh`, { method: 'POST' });
      if (!res.ok) throw new Error('重新扫描失败');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      toastSuccess('已重新扫描 skills');
    },
    onError: (err) => toastError(errMessage(err, '重新扫描失败')),
  });
}

/** POST /api/skills/scan-local —— 扫描本机路径 */
export function useScanLocalSkills() {
  return useMutation({
    mutationFn: async (path: string) => {
      const res = await apiFetch(`${API}/skills/scan-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error(await apiError(res, '扫描本地 skills 失败'));
      return res.json() as Promise<ScanLocalSkillsResponse>;
    },
  });
}

/** POST /api/skills/import-local —— 导入到 .skills / ~/.multi-agent/skills */
export function useImportLocalSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportLocalSkillsInput) => {
      const res = await apiFetch(`${API}/skills/import-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '导入 skills 失败'));
      return res.json() as Promise<ImportLocalSkillsResponse>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      const ok = data.results.filter(
        (r) => r.status === 'created' || r.status === 'updated',
      ).length;
      const skip = data.results.filter((r) => r.status === 'skipped').length;
      const fail = data.results.filter((r) => r.status === 'failed').length;
      toastSuccess(
        `导入完成：${ok} 成功` +
          (skip ? ` · ${skip} 跳过` : '') +
          (fail ? ` · ${fail} 失败` : ''),
      );
    },
    onError: (err) => toastError(errMessage(err, '导入 skills 失败')),
  });
}

/** POST /api/skills/import-url —— URL 下载到本地 skill 目录 */
export function useImportSkillFromUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      url: string;
      target?: 'project' | 'user' | 'workspace';
      projectId?: string;
      overwrite?: boolean;
      name?: string;
    }) => {
      const res = await apiFetch(`${API}/skills/import-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => ({}))) as {
        name?: string;
        status?: string;
        error?: string;
        originType?: string;
        path?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.error || (await apiError(res, 'URL 导入 skill 失败')),
        );
      }
      return data as {
        name: string;
        status: 'created' | 'updated' | 'skipped' | 'failed';
        source: 'project' | 'user';
        path?: string;
        error?: string;
        originType?: string;
        sourceUrl?: string;
        projectSkillsDir: string | null;
        userSkillsDir: string;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      if (data.status === 'skipped') {
        toastSuccess(`已存在，已跳过 · ${data.name}`);
      } else {
        toastSuccess(
          `${data.status === 'updated' ? '已更新' : '已导入'} · ${data.name}` +
            (data.originType ? `（${data.originType}）` : ''),
        );
      }
    },
    onError: (err) => toastError(errMessage(err, 'URL 导入 skill 失败')),
  });
}

// GET /api/agents/:id —— 单 agent 详情（profile + MCP Tab 回填）
