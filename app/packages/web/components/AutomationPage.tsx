'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  renderAutomationTemplate,
  type AutomationRule,
  type AutomationScheduleKind,
  type CreateAutomationRuleInput,
} from '@ma/shared';
import {
  useAgents,
  useAutomationRules,
  useAutomationRuns,
  useCreateAutomationRule,
  useDeleteAutomationRule,
  useRunAutomationNow,
  useSquads,
  useUpdateAutomationRule,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

const INTERVAL_OPTIONS = [5, 15, 30, 60] as const;

function scheduleLabel(rule: AutomationRule): string {
  if (rule.scheduleKind === 'interval_minutes') {
    return `每 ${rule.intervalMinutes ?? '?'} 分钟`;
  }
  return `每天 ${rule.dailyTime ?? '??:??'}`;
}

function formatPlanned(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  return new Date(iso).toLocaleString();
}

function nextPlanTitle(rule: AutomationRule): string {
  if (!rule.enabled) return '规则已停用，定时不会触发';
  if (!rule.nextPlannedAt) return '无法计算下次计划（检查调度配置）';
  return `下次计划 ${formatPlanned(rule.nextPlannedAt)}`;
}

function RuleRuns({ ruleId }: { ruleId: string }) {
  const { data: runs, isLoading, isError } = useAutomationRuns(ruleId, 8);

  if (isLoading) {
    return <div className="automation-runs text-dim text-sm">加载执行记录…</div>;
  }
  if (isError) {
    return <div className="automation-runs text-dim text-sm">加载执行记录失败</div>;
  }
  if (!runs || runs.length === 0) {
    return <div className="automation-runs text-dim text-sm">暂无执行记录</div>;
  }

  return (
    <div className="automation-runs">
      <table className="data-table automation-runs-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>来源</th>
            <th>计划时刻</th>
            <th>Issue</th>
            <th>错误</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>
                <span className={`run-status-pill run-status-pill--${r.status}`}>
                  {r.status}
                </span>
              </td>
              <td className="text-dim text-sm">{r.source}</td>
              <td className="text-dim text-sm">
                {new Date(r.plannedAt).toLocaleString()}
              </td>
              <td className="text-sm">
                {r.issueId ? (
                  <Link href={`/issues/${r.issueId}`}>
                    {r.issueId.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-dim">—</span>
                )}
              </td>
              <td className="text-dim text-sm" title={r.error ?? undefined}>
                {r.error ? (r.error.length > 48 ? `${r.error.slice(0, 48)}…` : r.error) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// bu05：/automation 列表 + 新建 + enabled 开关 + 立即执行 + 可选 runs
export function AutomationPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useAutomationRules();
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const create = useCreateAutomationRule();
  const update = useUpdateAutomationRule();
  const del = useDeleteAutomationRule();
  const runNow = useRunAutomationNow();

  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [scheduleKind, setScheduleKind] =
    useState<AutomationScheduleKind>('interval_minutes');
  const [intervalMinutes, setIntervalMinutes] =
    useState<(typeof INTERVAL_OPTIONS)[number]>(15);
  const [dailyTime, setDailyTime] = useState('09:00');
  const [assigneeValue, setAssigneeValue] = useState('');
  const [titleTemplate, setTitleTemplate] = useState('巡检 {{date}} {{time}}');
  const [bodyTemplate, setBodyTemplate] = useState('自动创建');

  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);
  const squadNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of squads) m.set(s.id, s.name);
    return m;
  }, [squads]);

  function assigneeLabel(rule: AutomationRule): string {
    if (rule.assigneeType === 'agent') {
      return agentNameById.get(rule.assigneeId) ?? rule.assigneeId.slice(0, 8);
    }
    return squadNameById.get(rule.assigneeId) ?? rule.assigneeId.slice(0, 8);
  }

  function resetForm() {
    setName('');
    setScheduleKind('interval_minutes');
    setIntervalMinutes(15);
    setDailyTime('09:00');
    setAssigneeValue('');
    setTitleTemplate('巡检 {{date}} {{time}}');
    setBodyTemplate('自动创建');
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !assigneeValue || !titleTemplate.trim()) return;

    let assigneeType: 'agent' | 'squad';
    let assigneeId: string;
    if (assigneeValue.startsWith('agent:')) {
      assigneeType = 'agent';
      assigneeId = assigneeValue.slice('agent:'.length);
    } else if (assigneeValue.startsWith('squad:')) {
      assigneeType = 'squad';
      assigneeId = assigneeValue.slice('squad:'.length);
    } else {
      return;
    }

    const input: CreateAutomationRuleInput = {
      name: name.trim(),
      enabled: true,
      scheduleKind,
      intervalMinutes: scheduleKind === 'interval_minutes' ? intervalMinutes : null,
      dailyTime: scheduleKind === 'daily_at' ? dailyTime : null,
      assigneeType,
      assigneeId,
      titleTemplate: titleTemplate.trim(),
      bodyTemplate: bodyTemplate,
    };

    create.mutate(input, {
      onSuccess: () => resetForm(),
    });
  }

  function toggleEnabled(rule: AutomationRule) {
    update.mutate({
      id: rule.id,
      input: { enabled: !rule.enabled },
    });
  }

  function handleDelete(rule: AutomationRule) {
    if (!window.confirm(`确定删除规则「${rule.name}」？相关执行记录会一并删除。`)) {
      return;
    }
    del.mutate(rule.id, {
      onSuccess: () => {
        if (expandedId === rule.id) setExpandedId(null);
      },
    });
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <EmptyState title="加载自动化规则…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-container">
        <EmptyState
          title="无法加载自动化规则"
          description={
            error instanceof Error ? error.message : '请确认 API 服务已启动'
          }
          action={
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => void refetch()}
            >
              重试
            </button>
          }
        />
      </div>
    );
  }

  const rules = data ?? [];

  return (
    <div className="page-container automation-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            自动化 <span className="count">{rules.length}</span>
          </div>
          <div className="page-desc">
            按间隔或每日时刻自动建 Issue 并指派；列表展示下次计划时刻
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? '刷新中…' : '刷新'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '收起' : '新建规则'}
          </button>
        </div>
      </div>

      {open && (
        <form className="ops-form" onSubmit={submit}>
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>名称</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：每 15 分钟巡检"
                required
                autoFocus
                maxLength={80}
              />
            </label>
            <label className="ops-field">
              <span>调度类型</span>
              <select
                value={scheduleKind}
                onChange={(e) =>
                  setScheduleKind(e.target.value as AutomationScheduleKind)
                }
              >
                <option value="interval_minutes">固定间隔</option>
                <option value="daily_at">每日时刻</option>
              </select>
            </label>
            {scheduleKind === 'interval_minutes' ? (
              <label className="ops-field">
                <span>间隔（分钟）</span>
                <select
                  value={intervalMinutes}
                  onChange={(e) =>
                    setIntervalMinutes(
                      Number(e.target.value) as (typeof INTERVAL_OPTIONS)[number],
                    )
                  }
                >
                  {INTERVAL_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="ops-field">
                <span>每日时刻（本地 HH:mm）</span>
                <input
                  type="time"
                  value={dailyTime}
                  onChange={(e) => setDailyTime(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="ops-field">
              <span>指派给</span>
              <select
                value={assigneeValue}
                onChange={(e) => setAssigneeValue(e.target.value)}
                required
                aria-label="指派 agent 或小队"
              >
                <option value="">选择 agent 或小队…</option>
                <optgroup label="智能体">
                  {agents.map((a) => (
                    <option key={a.id} value={`agent:${a.id}`}>
                      {a.name} · {a.runtime}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="小队">
                  {squads.map((s) => (
                    <option key={s.id} value={`squad:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
          <label className="ops-field">
            <span>标题模板</span>
            <input
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              placeholder="巡检 {{date}} {{time}}"
              required
              maxLength={200}
            />
          </label>
          <label className="ops-field">
            <span>描述模板</span>
            <textarea
              className="ops-textarea"
              rows={3}
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              placeholder="支持 {{date}} {{time}} {{iso_time}} {{rule_name}}"
            />
          </label>
          <p className="automation-template-hint text-dim text-sm">
            占位符：
            <code>{'{{date}}'}</code> <code>{'{{time}}'}</code>{' '}
            <code>{'{{iso_time}}'}</code> <code>{'{{rule_name}}'}</code>
            （大小写敏感）
          </p>
          <div
            className="automation-template-preview"
            data-testid="automation-template-preview"
          >
            <div className="automation-template-preview-label text-dim text-sm">
              预览（以当前时刻、规则名渲染）
            </div>
            <div className="automation-template-preview-title">
              {renderAutomationTemplate(titleTemplate || '（空标题）', {
                plannedAt: Date.now(),
                ruleName: name.trim() || '新规则',
              })}
            </div>
            <pre className="automation-template-preview-body text-sm">
              {renderAutomationTemplate(bodyTemplate || '（空描述）', {
                plannedAt: Date.now(),
                ruleName: name.trim() || '新规则',
              })}
            </pre>
          </div>
          <div className="ops-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                create.isPending ||
                !name.trim() ||
                !assigneeValue ||
                !titleTemplate.trim()
              }
            >
              {create.isPending ? '创建中…' : '创建'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              取消
            </button>
          </div>
        </form>
      )}

      {rules.length === 0 ? (
        <EmptyState
          title="还没有自动化规则"
          description="新建一条规则：按间隔或每日时刻自动建 Issue，也可随时「立即执行」。"
          action={
            !open ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setOpen(true)}
              >
                新建规则
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>启用</th>
                <th>规则</th>
                <th>调度</th>
                <th>指派</th>
                <th>上次计划</th>
                <th>下次计划</th>
                <th />
              </tr>
            </thead>
            {rules.map((rule) => {
              const expanded = expandedId === rule.id;
              return (
                <tbody key={rule.id} className="automation-rule-group">
                  <tr data-testid={`automation-rule-row-${rule.id}`}>
                    <td>
                      <label
                        className="automation-toggle"
                        title={rule.enabled ? '已启用' : '已停用'}
                      >
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          disabled={update.isPending}
                          onChange={() => toggleEnabled(rule)}
                          aria-label={`${rule.enabled ? '停用' : '启用'} ${rule.name}`}
                        />
                        <span className="automation-toggle-ui" aria-hidden="true" />
                      </label>
                    </td>
                    <td>
                      <div className="automation-rule-name">{rule.name}</div>
                      <div className="text-dim text-sm automation-rule-tpl">
                        {rule.titleTemplate}
                      </div>
                    </td>
                    <td
                      className="text-sm"
                      title={nextPlanTitle(rule)}
                      data-testid="automation-schedule-label"
                    >
                      {scheduleLabel(rule)}
                    </td>
                    <td className="text-sm">
                      <span className="automation-assignee-chip">
                        {rule.assigneeType === 'agent' ? '智能体' : '小队'} ·{' '}
                        {assigneeLabel(rule)}
                      </span>
                    </td>
                    <td
                      className="text-dim text-sm"
                      data-testid="automation-last-planned"
                    >
                      {formatPlanned(rule.lastPlannedAt)}
                    </td>
                    <td
                      className="text-sm"
                      data-testid="automation-next-planned"
                      data-next={rule.nextPlannedAt ?? ''}
                      title={nextPlanTitle(rule)}
                    >
                      {rule.enabled ? (
                        formatPlanned(rule.nextPlannedAt)
                      ) : (
                        <span className="text-dim">停用</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={runNow.isPending}
                        onClick={() => runNow.mutate(rule.id)}
                      >
                        {runNow.isPending ? '执行中…' : '立即执行'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setExpandedId(expanded ? null : rule.id)}
                      >
                        {expanded ? '收起记录' : '最近执行'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={del.isPending}
                        onClick={() => handleDelete(rule)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="automation-runs-row">
                      <td colSpan={7}>
                        <RuleRuns ruleId={rule.id} />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      <p className="automation-footer text-dim text-sm">
        <Icon name="automation" size={14} className="nav-icon-svg" />{' '}
        停用后定时 tick 不再触发，「下次计划」显示停用；「立即执行」仍可用。
      </p>
    </div>
  );
}
