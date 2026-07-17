'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

type EnabledFilter = '' | 'on' | 'off';
type ScheduleFilter = '' | 'interval_minutes' | 'daily_at';

function parseEnabled(raw: string | null): EnabledFilter {
  if (raw === 'on' || raw === 'off') return raw;
  return '';
}

function parseSchedule(raw: string | null): ScheduleFilter {
  if (raw === 'interval_minutes' || raw === 'daily_at') return raw;
  return '';
}

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

// bu05：/automation 列表 + 新建 + enabled 开关 + 立即执行 + URL 可分享筛选
function AutomationPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error, refetch, isFetching } = useAutomationRules();
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const create = useCreateAutomationRule();
  const update = useUpdateAutomationRule();
  const del = useDeleteAutomationRule();
  const runNow = useRunAutomationNow();

  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  const [name, setName] = useState('');
  const [scheduleKind, setScheduleKind] =
    useState<AutomationScheduleKind>('interval_minutes');
  const [intervalMinutes, setIntervalMinutes] =
    useState<(typeof INTERVAL_OPTIONS)[number]>(15);
  const [dailyTime, setDailyTime] = useState('09:00');
  const [assigneeValue, setAssigneeValue] = useState('');
  const [titleTemplate, setTitleTemplate] = useState('巡检 {{date}} {{time}}');
  const [bodyTemplate, setBodyTemplate] = useState('自动创建');

  const qFromUrl = searchParams.get('q') ?? '';
  const enabledFromUrl = parseEnabled(searchParams.get('enabled'));
  const scheduleFromUrl = parseSchedule(searchParams.get('schedule'));
  const failedOnly = searchParams.get('failed') === '1';
  const [qDraft, setQDraft] = useState(qFromUrl);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  function replaceParams(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qDraft.trim();
      if (next === qFromUrl.trim()) return;
      replaceParams({ q: next || null });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

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

  function clearAllFilters() {
    setQDraft('');
    router.replace(pathname, { scroll: false });
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

  function startEdit(rule: AutomationRule) {
    setEditingId(rule.id);
    setEditTitle(rule.titleTemplate);
    setEditBody(rule.bodyTemplate ?? '');
    setExpandedId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
  }

  function saveEdit(rule: AutomationRule) {
    if (!editTitle.trim()) return;
    update.mutate(
      {
        id: rule.id,
        input: {
          titleTemplate: editTitle.trim(),
          bodyTemplate: editBody,
        },
      },
      {
        onSuccess: () => cancelEdit(),
      },
    );
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

  const rules = data ?? [];
  const hasActiveFilters = Boolean(
    qFromUrl.trim() || enabledFromUrl || scheduleFromUrl || failedOnly,
  );

  const visible = useMemo(() => {
    const q = qFromUrl.trim().toLowerCase();
    return rules.filter((rule) => {
      if (enabledFromUrl === 'on' && !rule.enabled) return false;
      if (enabledFromUrl === 'off' && rule.enabled) return false;
      if (scheduleFromUrl && rule.scheduleKind !== scheduleFromUrl) return false;
      if (failedOnly && (rule.failCount ?? 0) <= 0) return false;
      if (q) {
        const asgName =
          rule.assigneeType === 'agent'
            ? (agentNameById.get(rule.assigneeId) ?? rule.assigneeId)
            : (squadNameById.get(rule.assigneeId) ?? rule.assigneeId);
        const hay = `${rule.name} ${rule.titleTemplate} ${rule.bodyTemplate ?? ''} ${asgName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    rules,
    qFromUrl,
    enabledFromUrl,
    scheduleFromUrl,
    failedOnly,
    agentNameById,
    squadNameById,
  ]);

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

  return (
    <div className="page-container automation-page" data-testid="automation-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            自动化{' '}
            <span className="count" data-testid="automation-visible-count">
              {hasActiveFilters ? `${visible.length}/${rules.length}` : rules.length}
            </span>
          </div>
          <div className="page-desc">
            按间隔或每日时刻自动建 Issue 并指派；列表展示下次计划时刻
          </div>
        </div>
        <div className="page-actions">
          <Link
            href="/?origin=automation"
            className="btn-secondary btn-sm"
            data-testid="automation-to-board-origin"
            title="看板筛选自动化创建的 Issue"
          >
            看板 · 自动化 Issue
          </Link>
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
            <div className="automation-empty-actions" data-testid="automation-empty-actions">
              {!open ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="automation-empty-create"
                  onClick={() => setOpen(true)}
                >
                  新建规则
                </button>
              ) : null}
              <Link href="/agents" className="btn-secondary btn-sm">
                配置智能体
              </Link>
              <Link href="/settings" className="btn-ghost btn-sm">
                环境诊断
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="agents-filters" data-testid="automation-filters">
            <div className="table-search memory-search-wrap">
              <input
                type="search"
                placeholder="搜索规则名 / 模板 / 指派…"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                data-testid="automation-search"
                aria-label="搜索自动化规则"
              />
              {qFromUrl.trim() ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  data-testid="automation-search-clear"
                  onClick={() => {
                    setQDraft('');
                    replaceParams({ q: null });
                  }}
                >
                  清除
                </button>
              ) : null}
            </div>
            <label className="agents-filter-field">
              启用
              <select
                value={enabledFromUrl}
                data-testid="automation-enabled-filter"
                onChange={(e) => replaceParams({ enabled: e.target.value || null })}
                aria-label="按启用状态筛选"
              >
                <option value="">全部</option>
                <option value="on">已启用</option>
                <option value="off">已停用</option>
              </select>
            </label>
            <label className="agents-filter-field">
              调度
              <select
                value={scheduleFromUrl}
                data-testid="automation-schedule-filter"
                onChange={(e) => replaceParams({ schedule: e.target.value || null })}
                aria-label="按调度类型筛选"
              >
                <option value="">全部</option>
                <option value="interval_minutes">间隔</option>
                <option value="daily_at">每日</option>
              </select>
            </label>
            <label className="agents-filter-field agents-filter-check">
              <span className="sr-only">仅失败</span>
              <span className="runs-filter-check" style={{ marginTop: 18 }}>
                <input
                  type="checkbox"
                  checked={failedOnly}
                  data-testid="automation-failed-only"
                  onChange={(e) => replaceParams({ failed: e.target.checked ? '1' : null })}
                  aria-label="仅显示有失败记录的规则"
                />
                仅失败
              </span>
            </label>
          </div>

          {hasActiveFilters ? (
            <div
              className="agents-active-filters"
              data-testid="automation-active-filters"
              aria-label="当前筛选"
            >
              {qFromUrl.trim() ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="automation-chip-q"
                  onClick={() => {
                    setQDraft('');
                    replaceParams({ q: null });
                  }}
                >
                  搜索「{qFromUrl.trim()}」 ×
                </button>
              ) : null}
              {enabledFromUrl ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="automation-chip-enabled"
                  onClick={() => replaceParams({ enabled: null })}
                >
                  {enabledFromUrl === 'on' ? '已启用' : '已停用'} ×
                </button>
              ) : null}
              {scheduleFromUrl ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="automation-chip-schedule"
                  onClick={() => replaceParams({ schedule: null })}
                >
                  调度 · {scheduleFromUrl === 'interval_minutes' ? '间隔' : '每日'} ×
                </button>
              ) : null}
              {failedOnly ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="automation-chip-failed"
                  onClick={() => replaceParams({ failed: null })}
                >
                  仅失败 ×
                </button>
              ) : null}
              <button
                type="button"
                className="kanban-active-chip kanban-active-chip--clear"
                data-testid="automation-chip-clear-all"
                onClick={clearAllFilters}
              >
                清除全部
              </button>
            </div>
          ) : null}

          <div className="data-table-wrap">
          <table className="data-table" data-testid="automation-table">
            <thead>
              <tr>
                <th>启用</th>
                <th>规则</th>
                <th>调度</th>
                <th>指派</th>
                <th>上次计划</th>
                <th>下次计划</th>
                <th>执行</th>
                <th />
              </tr>
            </thead>
            {visible.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8} className="text-dim" style={{ textAlign: 'center' }}>
                    <div data-testid="automation-empty-filter">
                      <div>没有匹配的规则</div>
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          data-testid="automation-clear-filter"
                          onClick={clearAllFilters}
                        >
                          清除筛选
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : null}
            {visible.map((rule) => {
              const expanded = expandedId === rule.id;
              return (
                <tbody key={rule.id} className="automation-rule-group">
                  <tr data-testid={`automation-rule-row-${rule.id}`} data-rule-id={rule.id}>
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
                      <Link
                        href={`/automation?schedule=${encodeURIComponent(rule.scheduleKind)}`}
                        className="automation-schedule-link"
                        title="筛选同调度类型"
                      >
                        {scheduleLabel(rule)}
                      </Link>
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
                    <td className="text-sm" data-testid="automation-run-stats">
                      {(rule.failCount ?? 0) > 0 ? (
                        <span
                          className="automation-fail-count"
                          data-testid="automation-fail-count"
                          data-count={String(rule.failCount ?? 0)}
                          title={`失败 ${rule.failCount} 次 · 最近 ${rule.lastRunStatus ?? '—'}`}
                        >
                          失败 {rule.failCount}
                        </span>
                      ) : (
                        <span className="text-dim" data-testid="automation-fail-count" data-count="0">
                          {rule.lastRunStatus ? `最近 ${rule.lastRunStatus}` : '—'}
                        </span>
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
                        data-testid="automation-edit-template"
                        onClick={() =>
                          editingId === rule.id ? cancelEdit() : startEdit(rule)
                        }
                      >
                        {editingId === rule.id ? '取消编辑' : '编辑模板'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingId(null);
                          setExpandedId(expanded ? null : rule.id);
                        }}
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
                  {editingId === rule.id ? (
                    <tr className="automation-edit-row">
                      <td colSpan={8}>
                        <div
                          className="automation-edit-panel"
                          data-testid="automation-edit-panel"
                          data-rule-id={rule.id}
                        >
                          <label className="ops-field">
                            <span>标题模板</span>
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              maxLength={200}
                              data-testid="automation-edit-title"
                            />
                          </label>
                          <label className="ops-field">
                            <span>描述模板</span>
                            <textarea
                              className="ops-textarea"
                              rows={3}
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              data-testid="automation-edit-body"
                            />
                          </label>
                          <div
                            className="automation-template-preview"
                            data-testid="automation-edit-preview"
                          >
                            <div className="automation-template-preview-label text-dim text-sm">
                              预览（当前时刻 · {rule.name}）
                            </div>
                            <div className="automation-template-preview-title">
                              {renderAutomationTemplate(editTitle || '（空标题）', {
                                plannedAt: Date.now(),
                                ruleName: rule.name,
                              })}
                            </div>
                            <pre className="automation-template-preview-body text-sm">
                              {renderAutomationTemplate(editBody || '（空描述）', {
                                plannedAt: Date.now(),
                                ruleName: rule.name,
                              })}
                            </pre>
                          </div>
                          <div className="ops-form-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              data-testid="automation-edit-save"
                              disabled={update.isPending || !editTitle.trim()}
                              onClick={() => saveEdit(rule)}
                            >
                              {update.isPending ? '保存中…' : '保存模板'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={cancelEdit}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {expanded ? (
                    <tr className="automation-runs-row">
                      <td colSpan={8}>
                        <RuleRuns ruleId={rule.id} />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        </div>
        </>
      )}

      <p className="automation-footer text-dim text-sm">
        <Icon name="automation" size={14} className="nav-icon-svg" />{' '}
        停用后定时 tick 不再触发，「下次计划」显示停用；「立即执行」仍可用。
      </p>
    </div>
  );
}

export function AutomationPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <AutomationPageInner />
    </Suspense>
  );
}
