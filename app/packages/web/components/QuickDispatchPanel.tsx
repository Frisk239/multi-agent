'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AgentRun } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateQuickRun,
  useSettingsStatus,
  useSquads,
} from '@/lib/api';
import { toastSuccess } from '@/lib/toast';

const API = 'http://localhost:3001/api';

type QuickDispatchPanelProps = {
  open: boolean;
  onClose: () => void;
  /** wiki-memory-ops D1：从 /runs 失败 QC 预填 */
  initialPrompt?: string;
};

async function pollRunUntilIssueId(
  runId: string,
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<AgentRun | null> {
  const attempts = opts.attempts ?? 8;
  const intervalMs = opts.intervalMs ?? 1500;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API}/runs/${encodeURIComponent(runId)}`);
      if (res.ok) {
        const run = (await res.json()) as AgentRun;
        if (run.issueId) return run;
      }
    } catch {
      /* ignore transient */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

// bu03：快速派活 — prompt + agent|squad，无标题；侧栏 / Ctrl+K 共用
// qc-cwd-gate：cwd 未就绪时面板内警告，按钮改为「仍要派活」
export function QuickDispatchPanel({
  open,
  onClose,
  initialPrompt,
}: QuickDispatchPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [assigneeValue, setAssigneeValue] = useState('');
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const { data: settings } = useSettingsStatus();
  const createQuickRun = useCreateQuickRun();
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(agentIds);

  const cwdBlocked = useMemo(() => {
    const cwd = settings?.checks?.find((c) => c.id === 'cwd');
    return cwd?.status === 'error';
  }, [settings]);
  const cwdDetail = useMemo(() => {
    const cwd = settings?.checks?.find((c) => c.id === 'cwd');
    return cwd?.detail ?? '未配置 MA_WORKSPACE_CWD';
  }, [settings]);

  const selectedAssignee = useMemo(() => {
    if (assigneeValue.startsWith('agent:')) {
      const id = assigneeValue.slice('agent:'.length);
      const ag = agents.find((a) => a.id === id);
      const rd = readinessMap[id];
      return {
        type: 'agent' as const,
        id,
        name: ag?.name ?? id,
        status: rd?.status,
        detail: rd?.detail,
      };
    }
    if (assigneeValue.startsWith('squad:')) {
      const id = assigneeValue.slice('squad:'.length);
      const sq = squads.find((s) => s.id === id);
      const leaderId = sq?.leaderId;
      const rd = leaderId ? readinessMap[leaderId] : undefined;
      return {
        type: 'squad' as const,
        id,
        name: sq?.name ?? id,
        leaderId: leaderId ?? null,
        status: rd?.status,
        detail: rd?.detail,
      };
    }
    return null;
  }, [assigneeValue, agents, squads, readinessMap]);

  const assigneeBlocked =
    selectedAssignee?.status != null &&
    selectedAssignee.status !== 'ready' &&
    selectedAssignee.status !== 'busy';

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setPrompt('');
      setAssigneeValue('');
      return;
    }
    if (initialPrompt?.trim()) {
      setPrompt(initialPrompt.trim());
    }
  }, [open, initialPrompt]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !assigneeValue || createQuickRun.isPending) return;

    let assignee: { type: 'agent' | 'squad'; id: string } | null = null;
    if (assigneeValue.startsWith('agent:')) {
      assignee = { type: 'agent', id: assigneeValue.slice('agent:'.length) };
    } else if (assigneeValue.startsWith('squad:')) {
      assignee = { type: 'squad', id: assigneeValue.slice('squad:'.length) };
    }
    if (!assignee) return;

    try {
      const { run } = await createQuickRun.mutateAsync({
        prompt: prompt.trim(),
        assignee,
      });
      onClose();
      // 可选短轮询：agent 建卡并 Link 后 toast identifier/id
      void pollRunUntilIssueId(run.id).then((linked) => {
        if (!linked?.issueId) return;
        toastSuccess(`已创建 Issue · ${linked.issueId.slice(0, 8)}…`, {
          action: {
            label: '打开 Issue',
            href: `/issues/${linked.issueId}`,
          },
          durationMs: 8000,
        });
      });
    } catch {
      // useCreateQuickRun onError 已 toast
    }
  }

  return (
    <div className="cmdk-overlay" role="presentation" onClick={onClose}>
      <div
        className="cmdk-dialog quick-dispatch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="快速派活"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-dispatch-header">快速派活</div>
        <p className="quick-dispatch-hint">
          无需标题。提交后先派出建卡任务，agent 会创建 Issue 并自动开工。
        </p>
        {cwdBlocked ? (
          <div
            className="quick-dispatch-cwd-banner"
            data-testid="quick-dispatch-cwd-banner"
            role="status"
          >
            <div>
              <strong>工作区未就绪</strong>
              <p className="text-sm">
                {cwdDetail}
                。仍可派发，但 run 很可能立刻失败。
              </p>
            </div>
            <div className="quick-dispatch-cwd-actions" data-testid="quick-dispatch-cwd-actions">
              <Link
                href="/settings"
                className="btn-secondary btn-sm"
                data-testid="quick-dispatch-settings"
                onClick={onClose}
              >
                环境诊断
              </Link>
              <Link
                href="/agents?ready=cwd_missing"
                className="btn-ghost btn-sm"
                data-testid="quick-dispatch-agents-cwd"
                onClick={onClose}
              >
                智能体 cwd
              </Link>
              <Link
                href="/runs?status=failed"
                className="btn-ghost btn-sm"
                data-testid="quick-dispatch-failed-runs"
                onClick={onClose}
              >
                失败运行
              </Link>
              <Link
                href="/inbox?kind=run_failed&read=unread"
                className="btn-ghost btn-sm"
                data-testid="quick-dispatch-inbox-fails"
                onClick={onClose}
              >
                收件箱失败
              </Link>
            </div>
          </div>
        ) : null}
        <form className="quick-dispatch-form" onSubmit={handleSubmit}>
          <label className="ops-field">
            <span>指派给</span>
            <select
              value={assigneeValue}
              onChange={(e) => setAssigneeValue(e.target.value)}
              aria-label="指派 agent 或小队"
              required
              autoFocus
              data-testid="quick-dispatch-assignee"
            >
              <option value="">选择 agent 或小队…</option>
              <optgroup label="智能体">
                {agents.map((a) => {
                  const st = readinessMap[a.id]?.status;
                  const hint =
                    st && st !== 'ready' && st !== 'busy' ? ` · ${st}` : '';
                  return (
                    <option key={a.id} value={`agent:${a.id}`}>
                      {a.name} · {a.runtime}
                      {hint}
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="小队">
                {squads.map((s) => {
                  const st = s.leaderId ? readinessMap[s.leaderId]?.status : undefined;
                  const hint =
                    st && st !== 'ready' && st !== 'busy' ? ` · 队长 ${st}` : '';
                  return (
                    <option key={s.id} value={`squad:${s.id}`}>
                      {s.name}
                      {hint}
                    </option>
                  );
                })}
              </optgroup>
            </select>
          </label>
          {selectedAssignee && assigneeBlocked ? (
            <div
              className="quick-dispatch-assignee-banner"
              data-testid="quick-dispatch-assignee-banner"
              data-status={selectedAssignee.status ?? 'unknown'}
              role="status"
            >
              <div>
                <strong>指派方可能无法执行</strong>
                <p className="text-sm">
                  {selectedAssignee.type === 'agent' ? '智能体' : '小队队长'}「
                  {selectedAssignee.name}」：{selectedAssignee.status}
                  {selectedAssignee.detail ? ` · ${selectedAssignee.detail}` : ''}
                </p>
              </div>
              <div
                className="quick-dispatch-cwd-actions"
                data-testid="quick-dispatch-assignee-actions"
              >
                {selectedAssignee.status === 'runtime_missing' ? (
                  <Link
                    href="/runtimes"
                    className="btn-secondary btn-sm"
                    data-testid="quick-dispatch-assignee-runtimes"
                    onClick={onClose}
                  >
                    运行时
                  </Link>
                ) : (
                  <Link
                    href="/settings"
                    className="btn-secondary btn-sm"
                    data-testid="quick-dispatch-assignee-settings"
                    onClick={onClose}
                  >
                    环境
                  </Link>
                )}
                {selectedAssignee.type === 'agent' ? (
                  <Link
                    href={`/agents/${selectedAssignee.id}`}
                    className="btn-ghost btn-sm"
                    data-testid="quick-dispatch-assignee-detail"
                    onClick={onClose}
                  >
                    智能体详情
                  </Link>
                ) : (
                  <Link
                    href={`/squads/${selectedAssignee.id}`}
                    className="btn-ghost btn-sm"
                    data-testid="quick-dispatch-assignee-detail"
                    onClick={onClose}
                  >
                    小队详情
                  </Link>
                )}
                {selectedAssignee.status ? (
                  <Link
                    href={
                      selectedAssignee.type === 'agent'
                        ? `/agents?ready=${encodeURIComponent(selectedAssignee.status)}`
                        : `/squads?ready=${encodeURIComponent(selectedAssignee.status)}`
                    }
                    className="btn-ghost btn-sm"
                    data-testid="quick-dispatch-assignee-same"
                    onClick={onClose}
                  >
                    同态列表
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
          <label className="ops-field">
            <span>任务描述</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="用自然语言描述你想让 agent 做什么…"
              rows={5}
              required
            />
          </label>
          <div className="quick-dispatch-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn-primary"
              data-testid="quick-dispatch-submit"
              data-cwd-blocked={cwdBlocked ? '1' : '0'}
              title={cwdBlocked ? '工作区未就绪，run 可能失败' : undefined}
              disabled={!prompt.trim() || !assigneeValue || createQuickRun.isPending}
            >
              {createQuickRun.isPending
                ? '派发中…'
                : cwdBlocked
                  ? '仍要派活'
                  : '派活'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
