'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AgentRun } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateQuickRun,
  useProjects,
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

type ExecPreview =
  | { kind: 'isolated'; reason: 'no_project' | 'no_path'; projectTitle?: string }
  | { kind: 'project_local'; path: string; projectTitle: string }
  | { kind: 'invalid_path'; path: string; projectTitle: string };

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
// B2：可选 project + 执行目录预检；服务端 readiness 硬闸
export function QuickDispatchPanel({
  open,
  onClose,
  initialPrompt,
}: QuickDispatchPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [assigneeValue, setAssigneeValue] = useState('');
  const [projectId, setProjectId] = useState('');
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const { data: projects = [] } = useProjects();
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

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const execPreview: ExecPreview = useMemo(() => {
    if (!selectedProject) return { kind: 'isolated', reason: 'no_project' };
    const path = selectedProject.localPath?.trim() || '';
    if (!path) {
      return {
        kind: 'isolated',
        reason: 'no_path',
        projectTitle: selectedProject.title,
      };
    }
    if (selectedProject.localPathExists === false) {
      return {
        kind: 'invalid_path',
        path,
        projectTitle: selectedProject.title,
      };
    }
    return {
      kind: 'project_local',
      path,
      projectTitle: selectedProject.title,
    };
  }, [selectedProject]);

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

  const hardAssigneeBlock =
    assigneeBlocked &&
    selectedAssignee &&
    (selectedAssignee.status === 'cwd_missing' ||
      selectedAssignee.status === 'runtime_missing' ||
      selectedAssignee.status === 'error');

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
      setProjectId('');
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

    // 与 Issue 硬闸一致：cwd_missing / runtime_missing / error 禁止提交
    if (hardAssigneeBlock && selectedAssignee) {
      window.alert(
        `${selectedAssignee.name} 当前不可开工（${selectedAssignee.status}）。请先修复环境/运行时。`,
      );
      return;
    }

    if (projectId) {
      try {
        const res = await fetch(`http://localhost:3001/api/projects/${projectId}/git-status`);
        if (res.ok) {
          const { status, count } = await res.json() as { status: string; count: number };
          if (status === 'dirty' && !window.confirm(`⚠️ 本地代码仓库存在未提交修改 (${count} 个文件)，派发 Agent 可能会修改/覆写相关代码。是否继续？`)) {
            return;
          }
        }
      } catch {
        // ignore
      }
    }

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
        projectId: projectId || undefined,
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
          无需标题。提交后先派出建卡任务，agent 会创建 Issue 并自动开工。可选绑定项目，在真仓执行。
        </p>
        {cwdBlocked ? (
          <div
            className="quick-dispatch-cwd-banner"
            data-testid="quick-dispatch-cwd-banner"
            role="status"
          >
            <div>
              <strong>工作区未就绪（已启用工作区 cwd）</strong>
              <p className="text-sm">
                {cwdDetail}
                。MA_ISSUE_USE_WORKSPACE_CWD 开启时服务端拒绝开工；默认隔离模式不会出现此条。
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

        <div
          className={
            'quick-dispatch-exec-banner' +
            (execPreview.kind === 'invalid_path'
              ? ' is-bad'
              : execPreview.kind === 'project_local'
                ? ' is-ok'
                : ' is-warn')
          }
          data-testid="quick-dispatch-exec-banner"
          data-mode={
            execPreview.kind === 'project_local'
              ? 'project_local'
              : execPreview.kind === 'invalid_path'
                ? 'invalid'
                : 'isolated'
          }
          role="status"
        >
          {execPreview.kind === 'isolated' && execPreview.reason === 'no_project' ? (
            <span>
              <strong>将在隔离目录执行</strong>
              未关联项目 — 不会改动业务仓。绑项目后进真仓。
            </span>
          ) : null}
          {execPreview.kind === 'isolated' && execPreview.reason === 'no_path' ? (
            <span>
              <strong>将在隔离目录执行</strong>
              项目「{execPreview.projectTitle}」未绑定本机目录。
            </span>
          ) : null}
          {execPreview.kind === 'invalid_path' ? (
            <span>
              <strong>项目路径无效</strong>
              「{execPreview.projectTitle}」· <code>{execPreview.path}</code>
              — run 会失败。
            </span>
          ) : null}
          {execPreview.kind === 'project_local' ? (
            <span>
              <strong>将在项目本机目录执行</strong>
              「{execPreview.projectTitle}」· <code>{execPreview.path}</code>
            </span>
          ) : null}
        </div>

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
          <label className="ops-field">
            <span>项目（可选）</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="所属项目"
              data-testid="quick-dispatch-project"
            >
              <option value="">无项目（隔离执行）</option>
              {projects.map((p) => {
                const pathHint = p.localPath
                  ? p.localPathExists
                    ? ' · 已绑目录'
                    : ' · 路径无效'
                  : ' · 未绑目录';
                return (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {pathHint}
                  </option>
                );
              })}
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
                  {hardAssigneeBlock ? ' · 服务端将拒绝排队' : ''}
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
              data-testid="quick-dispatch-prompt"
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
              data-assignee-blocked={assigneeBlocked ? '1' : '0'}
              data-exec-mode={
                execPreview.kind === 'project_local'
                  ? 'project_local'
                  : execPreview.kind === 'invalid_path'
                    ? 'invalid'
                    : 'isolated'
              }
              title={
                hardAssigneeBlock
                  ? '指派方不可开工，服务端拒绝排队'
                  : cwdBlocked
                    ? '工作区未就绪，服务端拒绝开工'
                    : execPreview.kind === 'invalid_path'
                      ? '项目路径无效，run 可能失败'
                      : undefined
              }
              disabled={
                !prompt.trim() ||
                !assigneeValue ||
                createQuickRun.isPending ||
                Boolean(hardAssigneeBlock)
              }
            >
              {createQuickRun.isPending
                ? '派发中…'
                : hardAssigneeBlock
                  ? '不可派活'
                  : cwdBlocked || assigneeBlocked
                    ? '仍要派活'
                    : '派活'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
