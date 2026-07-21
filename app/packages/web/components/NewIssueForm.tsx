'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CreateIssueInput, Priority } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateIssue,
  useSettingsStatus,
  useSquads,
} from '@/lib/api';
import { Icon } from './Icon';

// S12：内联表单升级——可指派 agent/squad；侧栏 /?new=1 触发展开
// issue-cwd-gate：有指派且 cwd 未就绪时警告（与快速派活对齐）
export function NewIssueForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('none');
  const [assigneeValue, setAssigneeValue] = useState('');
  const create = useCreateIssue();
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const { data: settings } = useSettingsStatus();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
  const willEnqueue = Boolean(assigneeValue);
  const showCwdWarn = cwdBlocked && willEnqueue;

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
    if (searchParams.get('new') === '1') {
      setOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('new');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  function reset() {
    setTitle('');
    setPriority('none');
    setAssigneeValue('');
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    let assignee: CreateIssueInput['assignee'] = null;
    if (assigneeValue.startsWith('agent:')) {
      assignee = { type: 'agent', id: assigneeValue.slice('agent:'.length) };
    } else if (assigneeValue.startsWith('squad:')) {
      assignee = { type: 'squad', id: assigneeValue.slice('squad:'.length) };
    }

    create.mutate(
      { title: title.trim(), priority, assignee },
      {
        onSuccess: () => reset(),
      },
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn-new-issue" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        新建 Issue
      </button>
    );
  }

  return (
    <form className="new-issue-form" onSubmit={submit} data-testid="new-issue-form">
      {showCwdWarn ? (
        <div
          className="new-issue-cwd-banner"
          data-testid="new-issue-cwd-banner"
          role="status"
        >
          <span>
            <strong>工作区未就绪</strong>
            {cwdDetail} — 启用工作区 cwd 时服务端会拒绝开工（不会静默排队）。
          </span>
          <div className="new-issue-cwd-actions" data-testid="new-issue-cwd-actions">
            <Link href="/settings" className="btn-secondary btn-sm" data-testid="new-issue-settings">
              环境诊断
            </Link>
            <Link
              href="/agents?ready=cwd_missing"
              className="btn-ghost btn-sm"
              data-testid="new-issue-agents-cwd"
            >
              智能体 cwd
            </Link>
            <Link
              href="/runs?status=failed"
              className="btn-ghost btn-sm"
              data-testid="new-issue-failed-runs"
            >
              失败运行
            </Link>
          </div>
        </div>
      ) : null}
      <input
        className="new-issue-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        autoFocus
        data-testid="new-issue-title"
      />
      <select
        className="new-issue-select"
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        aria-label="优先级"
      >
        <option value="none">无</option>
        <option value="low">低</option>
        <option value="medium">中</option>
        <option value="high">高</option>
        <option value="urgent">紧急</option>
      </select>
      <select
        className="new-issue-select new-issue-assignee"
        value={assigneeValue}
        onChange={(e) => setAssigneeValue(e.target.value)}
        aria-label="指派 agent 或小队"
        data-testid="new-issue-assignee"
      >
        <option value="">未指派</option>
        <optgroup label="智能体">
          {agents.map((a) => {
            const st = readinessMap[a.id]?.status;
            const hint = st && st !== 'ready' && st !== 'busy' ? ` · ${st}` : '';
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
      {selectedAssignee && assigneeBlocked ? (
        <div
          className="new-issue-assignee-banner"
          data-testid="new-issue-assignee-banner"
          data-status={selectedAssignee.status ?? 'unknown'}
          role="status"
        >
          <span>
            <strong>指派方可能无法执行</strong>
            {selectedAssignee.type === 'agent' ? '智能体' : '小队队长'}「
            {selectedAssignee.name}」：{selectedAssignee.status}
            {selectedAssignee.detail ? ` · ${selectedAssignee.detail}` : ''}
          </span>
          <div className="new-issue-cwd-actions" data-testid="new-issue-assignee-actions">
            {selectedAssignee.status === 'runtime_missing' ? (
              <Link
                href="/runtimes"
                className="btn-secondary btn-sm"
                data-testid="new-issue-assignee-runtimes"
              >
                运行时
              </Link>
            ) : (
              <Link
                href="/settings"
                className="btn-secondary btn-sm"
                data-testid="new-issue-assignee-settings"
              >
                环境
              </Link>
            )}
            <Link
              href={
                selectedAssignee.type === 'agent'
                  ? `/agents/${selectedAssignee.id}`
                  : `/squads/${selectedAssignee.id}`
              }
              className="btn-ghost btn-sm"
              data-testid="new-issue-assignee-detail"
            >
              详情
            </Link>
            {selectedAssignee.status ? (
              <Link
                href={
                  selectedAssignee.type === 'agent'
                    ? `/agents?ready=${encodeURIComponent(selectedAssignee.status)}`
                    : `/squads?ready=${encodeURIComponent(selectedAssignee.status)}`
                }
                className="btn-ghost btn-sm"
                data-testid="new-issue-assignee-same"
              >
                同态列表
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        type="submit"
        className="btn-primary"
        data-testid="new-issue-submit"
        data-cwd-blocked={showCwdWarn ? '1' : '0'}
        data-assignee-blocked={assigneeBlocked ? '1' : '0'}
        title={
          showCwdWarn
            ? '工作区未就绪时服务端拒绝开工'
            : assigneeBlocked
              ? '指派方可能无法执行'
              : undefined
        }
        disabled={create.isPending || !title.trim()}
      >
        {create.isPending
          ? '提交中…'
          : showCwdWarn || assigneeBlocked
            ? '仍要创建'
            : '提交'}
      </button>
      <button type="button" className="btn-ghost" onClick={reset}>
        取消
      </button>
    </form>
  );
}
