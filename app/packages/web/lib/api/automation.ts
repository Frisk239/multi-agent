'use client';
/**
 * O3 拆分：automation 域 hooks（原 lib/api.ts 3102-3283 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  Issue,
  AutomationRule,
  AutomationRun,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';
import { automationRunHref } from '../automation-run-link';
import { classifyAutomationRunNowOutcome } from '../automation-run-now-outcome';
import { toastError, toastSuccess, toastWarning } from '../toast';

// —— bu05 Automation hooks ——

// GET /api/automation/rules
export function useAutomationRules() {
  return useQuery<AutomationRule[]>({
    queryKey: ['automation-rules'],
    queryFn: async () => {
      const res = await apiFetch(`${API}/automation/rules`);
      if (!res.ok) throw new Error(await apiError(res, '加载自动化规则失败'));
      return res.json();
    },
  });
}

// POST /api/automation/rules
export function useCreateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAutomationRuleInput) => {
      const res = await apiFetch(`${API}/automation/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '创建规则失败'));
      return res.json() as Promise<AutomationRule>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      toastSuccess('规则已创建');
    },
    onError: (err) => toastError(errMessage(err, '创建规则失败')),
  });
}

// PATCH /api/automation/rules/:id
export function useUpdateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateAutomationRuleInput;
    }) => {
      const res = await apiFetch(`${API}/automation/rules/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await apiError(res, '更新规则失败'));
      return res.json() as Promise<AutomationRule>;
    },
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      qc.invalidateQueries({ queryKey: ['automation-rules', rule.id] });
    },
    onError: (err) => toastError(errMessage(err, '更新规则失败')),
  });
}

// DELETE /api/automation/rules/:id — HTTP DELETE keeps compatibility; domain
// semantics are an archive that preserves execution evidence.
export function useArchiveAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API}/automation/rules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(await apiError(res, '归档规则失败'));
      }
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      qc.invalidateQueries({ queryKey: ['automation-runs', id] });
      toastSuccess('规则已归档：已停止后续计划，执行记录已保留');
    },
    onError: (err) => toastError(errMessage(err, '归档规则失败')),
  });
}

function toastRunNowSuccess(run: AutomationRun) {
  if (run.issueId) {
    toastSuccess(`已创建 Issue · ${run.issueId.slice(0, 8)}…，等待执行结果`, {
      action: {
        label: '打开 Issue',
        href: `/issues/${run.issueId}`,
      },
      durationMs: 8000,
    });
    return;
  }

  // run_only 已派发的是 quick-create run，不应把它说成创建了一张 Issue。
  if (run.linkedRunId) {
    toastSuccess(`已派发运行 · ${run.linkedRunId.slice(0, 8)}…，等待执行结果`, {
      action: {
        label: '查看运行',
        href: automationRunHref(run.linkedRunId),
      },
      durationMs: 8000,
    });
    return;
  }

  toastSuccess('已派发运行，等待执行结果', {
    action: { label: '看板 · 自动化', href: '/?origin=automation' },
    durationMs: 8000,
  });
}

function toastRunNowWarning(run: AutomationRun) {
  if (run.status === 'skipped') {
    toastWarning(run.error || '本次执行已跳过，请查看最近执行', { durationMs: 8000 });
    return;
  }
  if (run.status === 'dispatching') {
    toastWarning('仍在派发中，请查看最近执行', { durationMs: 8000 });
    return;
  }
  toastWarning('仍在自动重试中，请查看最近执行', { durationMs: 8000 });
}

function toastRunNowError(run: AutomationRun) {
  if (run.status === 'pending_dispatch') {
    // 保留现有恢复入口：create_issue 离线仍有持久审计及可重新派发路径。
    toastError(run.error || 'Issue 已创建，但尚未派发', {
      action: run.issueId
        ? { label: '打开 Issue', href: `/issues/${run.issueId}` }
        : { label: '环境诊断', href: '/settings' },
      durationMs: 9000,
    });
    return;
  }

  if (run.status === 'failed') {
    const err = run.error || '执行失败';
    const cwdish = /MA_WORKSPACE_CWD|cwd|工作区/i.test(err);
    const noLeader = /无 leader|no leader/i.test(err);
    toastError(err, {
      action: noLeader
        ? { label: '小队列表', href: '/squads' }
        : cwdish
          ? { label: '环境诊断', href: '/settings' }
          : { label: '看板 · 自动化', href: '/?origin=automation' },
      durationMs: 8000,
    });
    return;
  }

  const status = typeof run.status === 'string' && run.status ? `（${run.status}）` : '';
  toastError(run.error || `立即执行未返回可确认的派发结果${status}`, { durationMs: 8000 });
}

// POST /api/automation/rules/:id/run-now
// 注意：业务失败时 HTTP 仍为 201；只能由运行时 status（而非 HTTP）决定 toast。
export function useRunAutomationNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(
        `${API}/automation/rules/${encodeURIComponent(id)}/run-now`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await apiError(res, '立即执行失败'));
      return res.json() as Promise<AutomationRun>;
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      qc.invalidateQueries({ queryKey: ['automation-runs', run.ruleId] });
      qc.invalidateQueries({ queryKey: ['issues'] });
      const outcome = classifyAutomationRunNowOutcome(run.status);
      if (outcome === 'success') {
        toastRunNowSuccess(run);
      } else if (outcome === 'warning') {
        toastRunNowWarning(run);
      } else {
        toastRunNowError(run);
      }
    },
    onError: (err) => toastError(errMessage(err, '立即执行失败')),
  });
}

// GET /api/automation/rules/:id/runs?limit=
export function useAutomationRuns(ruleId: string | null | undefined, limit = 10) {
  return useQuery<AutomationRun[]>({
    queryKey: ['automation-runs', ruleId, limit],
    queryFn: async () => {
      const res = await apiFetch(
        `${API}/automation/rules/${encodeURIComponent(ruleId!)}/runs?limit=${limit}`,
      );
      if (!res.ok) throw new Error(await apiError(res, '加载执行记录失败'));
      return res.json();
    },
    enabled: !!ruleId,
  });
}

export function useReconcileAutomationRun(ruleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiFetch(
        `${API}/automation/runs/${encodeURIComponent(runId)}/reconcile`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await apiError(res, '恢复派发失败'));
      return res.json() as Promise<{ run: AutomationRun; created: boolean }>;
    },
    onSuccess: ({ run, created }) => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      qc.invalidateQueries({ queryKey: ['automation-runs', ruleId] });
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      if (created) toastSuccess('已恢复派发');
      else if (run.status === 'pending_dispatch') toastError(run.error || '当前仍无法派发');
      else toastSuccess('已绑定现有运行');
    },
    onError: (err) => toastError(errMessage(err, '恢复派发失败')),
  });
}

