'use client';
/**
 * O3 拆分：quick-runs 域 hooks（原 lib/api.ts 2880-2924 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  AgentRun,
  CreateQuickRunInput,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { toastError, toastSuccess } from '../toast';

// —— bu03 Quick Create hooks ——

export function useCreateQuickRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQuickRunInput) => {
      const res = await apiFetch(`${API}/quick-runs`, {
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
    onError: (err: any) => {
      if (err?.code === 'readiness_failed') {
        let href = '/';
        let label = '打开';
        if (err.reason === 'cwd_missing') { href = '/settings'; label = '保存工作区'; }
        else if (err.reason === 'runtime_missing') { href = '/runtimes'; label = '运行时探测'; }
        else if (err.reason === 'readiness_error') { href = '/settings'; label = '环境诊断'; }
        else if (err.reason === 'no_leader') { href = '/squads'; label = '小队列表'; }
        toastError(err.message, { action: { label, href }, durationMs: 8000 });
      } else {
        toastError(errMessage(err, '快速派活失败'));
      }
    },
  });
}

