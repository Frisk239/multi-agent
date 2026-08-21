'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AUTOMATION_PRESETS,
  CreateAutomationRuleInput,
  renderAutomationTemplate,
  type AutomationPreset,
  type AutomationRule,
  type AutomationScheduleKind,
} from '@ma/shared';
import {
  API,
  apiFetch,
  useAgents,
  useAgentsReadinessMap,
  useAutomationRules,
  useAutomationRuns,
  useAutomationWebhookDeliveries,
  useCreateAutomationRule,
  useArchiveAutomationRule,
  useRotateAutomationWebhookToken,
  useRunAutomationNow,
  useReconcileAutomationRun,
  useSquads,
  useUpdateAutomationRule,
  useUpdateAutomationWebhookEvents,
  useUpdateAutomationWebhookRate,
} from '@/lib/api';
import { confirmDialog } from '@/lib/confirm-store';
import { toastWarning } from '@/lib/toast';
import { validateWith, type FieldErrors } from '@/lib/form-validation';
import { EmptyState } from './EmptyState';
import { FieldError } from './FieldError';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';
import { Select } from './Select';
import { AssigneeCombobox } from './AssigneeSelect';
import { automationRunHref } from '@/lib/automation-run-link';
import { classifyAutomationRunNowOutcome } from '@/lib/automation-run-now-outcome';
import {
  groupAutomationRunsForSkippedDrilldown,
  SKIPPED_STREAK_WINDOW,
  skippedStreakLabel,
  skippedStreakWindowNote,
} from '@/lib/automation-skipped-streak';

const INTERVAL_OPTIONS = [5, 15, 30, 60] as const;

type EnabledFilter = '' | 'on' | 'off';
type ScheduleFilter = '' | 'interval_minutes' | 'daily_at' | 'cron';

type ExpandedRuns = {
  ruleId: string;
  limit: number;
  focusSkipped: boolean;
  /** Re-focusing the same warning should return the operator to its summary. */
  skippedFocusRequest: number;
};

const RECENT_RUNS_LIMIT = 8;

function parseEnabled(raw: string | null): EnabledFilter {
  if (raw === 'on' || raw === 'off') return raw;
  return '';
}

function parseSchedule(raw: string | null): ScheduleFilter {
  if (raw === 'interval_minutes' || raw === 'daily_at' || raw === 'cron') return raw;
  return '';
}

function scheduleLabel(rule: AutomationRule): string {
  if (rule.scheduleKind === 'interval_minutes') {
    return `每 ${rule.intervalMinutes ?? '?'} 分钟`;
  }
  if (rule.scheduleKind === 'cron') {
    return `Cron: ${rule.cronExpression ?? '?'}`;
  }
  return `每天 ${rule.dailyTime ?? '??:??'}`;
}

function formatPlanned(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  return new Date(iso).toLocaleString();
}

const AUTOMATION_RUN_STATUS_LABEL: Record<string, string> = {
  // G6-2：两阶段派发占位态（副作用执行中，瞬态）
  dispatching: '派发中',
  // create_issue 与 run_only 共用 open 状态桶（run_only 无 Issue）
  issue_created: '已触发',
  pending_dispatch: '待派发',
  running: '执行中',
  retrying: '自动重试中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
};

function nextPlanTitle(rule: AutomationRule): string {
  if (!rule.enabled) return '规则已停用，定时不会触发';
  if (!rule.nextPlannedAt) return '无法计算下次计划（检查调度配置）';
  return `下次计划 ${formatPlanned(rule.nextPlannedAt)}`;
}

function abbreviatedRunError(error: string | null): string {
  return error ? (error.length > 48 ? `${error.slice(0, 48)}…` : error) : '—';
}

function RuleRuns({
  ruleId,
  limit = RECENT_RUNS_LIMIT,
  focusSkipped = false,
  skippedFocusRequest = 0,
}: {
  ruleId: string;
  limit?: number;
  focusSkipped?: boolean;
  skippedFocusRequest?: number;
}) {
  const { data: runs, isLoading, isError } = useAutomationRuns(ruleId, limit);
  const reconcile = useReconcileAutomationRun(ruleId);
  const [skippedDetailsOpen, setSkippedDetailsOpen] = useState(false);
  const skippedGroupButton = useRef<HTMLButtonElement>(null);
  const { skippedRuns, nonSkippedRuns, latestSkippedRun } = groupAutomationRunsForSkippedDrilldown(
    runs ?? [],
  );

  // Opening the warning always starts with its compact, countable summary.
  useEffect(() => {
    setSkippedDetailsOpen(false);
  }, [ruleId, limit, skippedFocusRequest]);

  // The warning launches an already-expanded region. Move the keyboard context
  // to the grouped audit summary only after its fetched records are available.
  useEffect(() => {
    if (focusSkipped && latestSkippedRun) skippedGroupButton.current?.focus();
  }, [focusSkipped, latestSkippedRun, skippedFocusRequest]);

  if (isLoading) {
    return (
      <div
        className="automation-runs text-dim text-sm"
        id={`automation-rule-runs-${ruleId}`}
        data-testid={`automation-rule-runs-${ruleId}`}
        data-limit={String(limit)}
      >
        加载执行记录…
      </div>
    );
  }
  if (isError) {
    return (
      <div
        className="automation-runs text-dim text-sm"
        id={`automation-rule-runs-${ruleId}`}
        data-testid={`automation-rule-runs-${ruleId}`}
        data-limit={String(limit)}
      >
        加载执行记录失败
      </div>
    );
  }
  if (!runs || runs.length === 0) {
    return (
      <div
        className="automation-runs text-dim text-sm"
        id={`automation-rule-runs-${ruleId}`}
        data-testid={`automation-rule-runs-${ruleId}`}
        data-limit={String(limit)}
      >
        暂无执行记录
      </div>
    );
  }

  return (
    <div
      className="automation-runs"
      id={`automation-rule-runs-${ruleId}`}
      data-testid={`automation-rule-runs-${ruleId}`}
      data-limit={String(limit)}
    >
      <table className="data-table automation-runs-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>来源</th>
            <th>计划时刻</th>
            <th>Issue</th>
            <th>Run</th>
            <th>原因 / 操作</th>
          </tr>
        </thead>
        <tbody>
          {skippedRuns.length > 0 && latestSkippedRun ? (
            <tr className="automation-skipped-group-row">
              <td colSpan={6}>
                <div className="automation-skipped-group">
                  <button
                    ref={skippedGroupButton}
                    type="button"
                    className="automation-skipped-group-toggle"
                    data-testid={`automation-skipped-group-${ruleId}`}
                    aria-expanded={skippedDetailsOpen}
                    aria-controls={`automation-skipped-details-${ruleId}`}
                    onClick={() => setSkippedDetailsOpen((open) => !open)}
                  >
                    {skippedDetailsOpen ? '收起' : '查看'}已跳过 {skippedRuns.length} 次
                  </button>
                  <span
                    className="text-dim text-sm"
                    data-testid={`automation-skipped-summary-${ruleId}`}
                  >
                    最近计划：{formatPlanned(latestSkippedRun.plannedAt)} · 原因：
                    {abbreviatedRunError(latestSkippedRun.error)}
                  </span>
                  {skippedDetailsOpen ? (
                    <div
                      id={`automation-skipped-details-${ruleId}`}
                      className="automation-skipped-details"
                      role="region"
                      aria-label={`已跳过 ${skippedRuns.length} 次的执行记录`}
                      data-testid={`automation-skipped-details-${ruleId}`}
                    >
                      <ul>
                        {skippedRuns.map((run) => (
                          <li
                            key={run.id}
                            data-testid={`automation-skipped-detail-${run.id}`}
                          >
                            <span>来源：{run.source}</span>
                            <span>计划时刻：{formatPlanned(run.plannedAt)}</span>
                            <span title={run.error ?? undefined}>
                              原因：{run.error || '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : null}
          {nonSkippedRuns.map((r) => (
            <tr key={r.id}>
              <td>
                <span className={`run-status-pill run-status-pill--${r.status}`}>
                  {AUTOMATION_RUN_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td className="text-dim text-sm">{r.source}</td>
              <td className="text-dim text-sm">
                {new Date(r.plannedAt).toLocaleString()}
              </td>
              <td className="text-sm">
                {r.issueId ? (
                  <Link
                    href={`/issues/${r.issueId}`}
                    data-testid={`automation-linked-issue-${r.id}`}
                  >
                    {r.issueId.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-dim">—</span>
                )}
              </td>
              <td className="text-sm">
                {r.linkedRunId ? (
                  <Link href={automationRunHref(r.linkedRunId)} data-testid="automation-linked-run">
                    {r.linkedRunId.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-dim">—</span>
                )}
              </td>
              <td className="text-dim text-sm" title={r.error ?? undefined}>
                {abbreviatedRunError(r.error)}
                {r.status === 'pending_dispatch' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginLeft: 8 }}
                    disabled={reconcile.isPending}
                    data-testid={`automation-reconcile-${r.id}`}
                    onClick={() => reconcile.mutate(r.id)}
                  >
                    {reconcile.isPending ? '恢复中…' : '重新派发'}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WEBHOOK_DELIVERY_STATUS_LABEL: Record<string, string> = {
  dispatched: '已触发',
  filtered: '已过滤',
  error: '错误',
  rate_limited: '已限流',
};

// 限流与过滤同为「未触发」而非错误，用 skipped 色避免告警疲劳
const WEBHOOK_DELIVERY_PILL_STATUS: Record<string, string> = {
  dispatched: 'issue_created',
  filtered: 'skipped',
  rate_limited: 'skipped',
  error: 'failed',
};

/**
 * automation webhook trigger：详情区块（学 multica autopilot webhook 面板）。
 * 三态：未生成（生成按钮）/ 已生成（URL + 复制 + 轮换）/ 轮换需 danger 确认（旧 URL 立即失效）。
 */
function RuleWebhookSection({ rule }: { rule: AutomationRule }) {
  const rotate = useRotateAutomationWebhookToken();
  const saveEvents = useUpdateAutomationWebhookEvents();
  const saveRate = useUpdateAutomationWebhookRate();
  const { data: deliveries, isLoading: deliveriesLoading } = useAutomationWebhookDeliveries(
    rule.id,
    20,
  );
  const [eventsDraft, setEventsDraft] = useState(rule.webhookEvents?.join(', ') ?? '');
  const [rateDraft, setRateDraft] = useState(rule.webhookRatePerMin?.toString() ?? '');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  useEffect(() => {
    setEventsDraft(rule.webhookEvents?.join(', ') ?? '');
  }, [rule.webhookEvents]);

  useEffect(() => {
    setRateDraft(rule.webhookRatePerMin?.toString() ?? '');
  }, [rule.webhookRatePerMin]);

  const webhookUrl = rule.webhookToken ? `${API}/webhooks/${rule.webhookToken}` : null;

  async function copyUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopyState('ok');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('err');
      window.setTimeout(() => setCopyState('idle'), 2500);
    }
  }

  function handleRotate() {
    void (async () => {
      const ok = await confirmDialog({
        title: '轮换 Webhook token？',
        description: '旧 URL 立即失效，使用旧 URL 的本地脚本 / git hook 将开始收到 404。',
        confirmLabel: '轮换',
        variant: 'danger',
      });
      if (ok) rotate.mutate(rule.id);
    })();
  }

  function saveEventsDraft() {
    const trimmed = eventsDraft.trim();
    saveEvents.mutate({ id: rule.id, events: trimmed ? trimmed : null });
  }

  // webhook-rate-limit：空 = 恢复默认上限；非法输入本地拦截（不静默归零）
  function saveRateDraft() {
    const trimmed = rateDraft.trim();
    if (!trimmed) {
      saveRate.mutate({ id: rule.id, perMinute: null });
      return;
    }
    const perMinute = Number(trimmed);
    if (!Number.isInteger(perMinute) || perMinute < 1 || perMinute > 1000) {
      toastWarning('每分钟上限需为 1-1000 的整数；留空恢复默认');
      return;
    }
    saveRate.mutate({ id: rule.id, perMinute });
  }

  return (
    <div
      className="automation-webhook-section"
      data-testid="automation-webhook-section"
      data-rule-id={rule.id}
    >
      <div className="settings-section-title">Webhook 触发</div>
      <p className="text-dim text-sm">
        本地脚本 / git hook 向下方 URL POST{' '}
        <code>{'{ "event": "push", "payload": {…} }'}</code> 即可触发本规则；{' '}
        <code>event: &quot;ping&quot;</code> 仅测连通。
      </p>
      <p className="text-dim text-sm">
        模板可用 webhook 变量：
        <code>{'{{webhook.event}}'}</code> <code>{'{{webhook.payload}}'}</code>{' '}
        <code>{'{{webhook.payload.<字段>}}'}</code>
        （触发时渲染进标题/描述；定时/手动触发渲染为空）
      </p>

      {rule.archivedAt ? (
        <p className="text-dim text-sm">规则已归档，Webhook 不会再触发。</p>
      ) : !rule.webhookToken ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid="automation-webhook-generate"
          disabled={rotate.isPending}
          onClick={() => rotate.mutate(rule.id)}
        >
          {rotate.isPending ? '生成中…' : '生成 Webhook'}
        </button>
      ) : (
        <div className="automation-webhook-url-row" data-testid="automation-webhook-url-row">
          <code
            className="automation-webhook-url"
            data-testid="automation-webhook-url"
            title={webhookUrl ?? undefined}
          >
            {webhookUrl}
          </code>{' '}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="automation-webhook-copy"
            onClick={() => void copyUrl()}
          >
            {copyState === 'ok' ? '已复制' : copyState === 'err' ? '复制失败' : '复制 URL'}
          </button>{' '}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="automation-webhook-rotate"
            disabled={rotate.isPending}
            onClick={handleRotate}
          >
            {rotate.isPending ? '轮换中…' : '轮换 token'}
          </button>
        </div>
      )}

      {rule.webhookToken && rule.archivedAt == null ? (
        <div className="automation-webhook-filter">
          <label className="ops-field">
            <span>事件过滤（逗号分隔；留空 = 全部放行）</span>
            <input
              value={eventsDraft}
              onChange={(e) => setEventsDraft(e.target.value)}
              placeholder="如 push, tag_push"
              data-testid="automation-webhook-events-input"
              maxLength={500}
            />
          </label>{' '}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="automation-webhook-events-save"
            disabled={saveEvents.isPending}
            onClick={saveEventsDraft}
          >
            {saveEvents.isPending ? '保存中…' : '保存过滤'}
          </button>{' '}
          <label className="ops-field">
            <span>每分钟上限（滑动窗口；留空 = 默认 10）</span>
            <input
              type="number"
              min={1}
              max={1000}
              step={1}
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)}
              placeholder="默认 10/分钟"
              data-testid="automation-webhook-rate-input"
            />
          </label>{' '}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="automation-webhook-rate-save"
            disabled={saveRate.isPending}
            onClick={saveRateDraft}
          >
            {saveRate.isPending ? '保存中…' : '保存上限'}
          </button>
        </div>
      ) : null}

      <div
        className="automation-webhook-deliveries"
        data-testid="automation-webhook-deliveries"
      >
        <div className="text-dim text-sm">
          {deliveriesLoading ? '加载触发记录…' : '最近触发（event / 结果 / 时间 / run）'}
        </div>
        {!deliveriesLoading && (!deliveries || deliveries.length === 0) ? (
          <div className="text-dim text-sm">暂无触发记录（ping 不记录）</div>
        ) : null}
        {deliveries && deliveries.length > 0 ? (
          <table className="data-table automation-webhook-deliveries-table">
            <thead>
              <tr>
                <th>事件</th>
                <th>结果</th>
                <th>时间</th>
                <th>Run</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} data-testid={`automation-webhook-delivery-${d.id}`}>
                  <td className="text-sm">{d.event}</td>
                  <td className="text-sm">
                    <span
                      className={`run-status-pill run-status-pill--${
                        WEBHOOK_DELIVERY_PILL_STATUS[d.status] ?? 'failed'
                      }`}
                    >
                      {WEBHOOK_DELIVERY_STATUS_LABEL[d.status] ?? d.status}
                    </span>
                    {d.error ? (
                      <span className="text-dim text-sm" title={d.error}>
                        {' '}
                        {abbreviatedRunError(d.error)}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-dim text-sm">{new Date(d.createdAt).toLocaleString()}</td>
                  <td className="text-sm">
                    {d.automationRunId ? (
                      <Link
                        href={automationRunHref(d.automationRunId)}
                        data-testid={`automation-webhook-delivery-run-${d.id}`}
                      >
                        {d.automationRunId.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

// bu05：/automation 列表 + 新建 + enabled 开关 + 立即执行 + URL 可分享筛选
function AutomationPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error, refetch, isFetching } = useAutomationRules();
  // Creation keeps its active-only roster, but existing rules may legitimately
  // point to an archived agent. Load all here so their lifecycle state is not
  // silently rendered as an unknown id.
  const { data: agents = [] } = useAgents();
  const { data: allAgents = [] } = useAgents({ archived: 'all' });
  const { data: squads = [] } = useSquads();
  const agentIds = useMemo(() => allAgents.map((a) => a.id), [allAgents]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(agentIds);
  const create = useCreateAutomationRule();
  const update = useUpdateAutomationRule();
  const archive = useArchiveAutomationRule();
  const runNow = useRunAutomationNow();

  const [open, setOpen] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<ExpandedRuns | null>(null);
  const [webhookRuleId, setWebhookRuleId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  const [name, setName] = useState('');
  const [scheduleKind, setScheduleKind] =
    useState<AutomationScheduleKind>('interval_minutes');
  const [intervalMinutes, setIntervalMinutes] =
    useState<(typeof INTERVAL_OPTIONS)[number]>(15);
  const [dailyTime, setDailyTime] = useState('09:00');
  const [cronExpression, setCronExpression] = useState('0 9 * * 1-5');
  const [cronPreview, setCronPreview] = useState<{ success: boolean; nextRuns?: number[]; error?: string } | null>(null);

  useEffect(() => {
    if (scheduleKind !== 'cron' || !cronExpression.trim()) {
      setCronPreview(null);
      return;
    }
    const controller = new AbortController();
    apiFetch(`${API}/automation/preview-cron?expression=${encodeURIComponent(cronExpression)}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setCronPreview(data))
      .catch(() => {});
    return () => controller.abort();
  }, [scheduleKind, cronExpression]);

  const [assigneeValue, setAssigneeValue] = useState('');
  const [titleTemplate, setTitleTemplate] = useState('巡检 {{date}} {{time}}');
  const [bodyTemplate, setBodyTemplate] = useState('自动创建');
  /** Multica: create_issue | run_only */
  const [executionMode, setExecutionMode] = useState<'create_issue' | 'run_only'>(
    'create_issue',
  );
  // W3：提交前 Zod 校验（CreateAutomationRuleInput）产生的字段级错误
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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
    for (const a of allAgents) m.set(a.id, a.name);
    return m;
  }, [allAgents]);
  const archivedAgentIds = useMemo(
    () => new Set(allAgents.filter((agent) => agent.archivedAt != null).map((agent) => agent.id)),
    [allAgents],
  );
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

  function archivedTargetLabel(rule: AutomationRule): string | null {
    if (rule.assigneeType === 'agent') {
      return archivedAgentIds.has(rule.assigneeId) ? '智能体已归档 · 立即执行将跳过' : null;
    }
    const squad = squads.find((candidate) => candidate.id === rule.assigneeId);
    return squad?.leaderId && archivedAgentIds.has(squad.leaderId)
      ? '队长已归档 · 立即执行将跳过'
      : null;
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
    setCronExpression('0 9 * * 1-5');
    setAssigneeValue('');
    setTitleTemplate('巡检 {{date}} {{time}}');
    setBodyTemplate('自动创建');
    setExecutionMode('create_issue');
    setFieldErrors({});
    setOpen(false);
  }

  /** Multica 模板画廊：点卡片 → 预填表单（仍须选手动指派后创建） */
  function applyPreset(preset: AutomationPreset | null) {
    if (!preset) {
      resetForm();
      setOpen(true);
      return;
    }
    setName(preset.name);
    setScheduleKind(preset.scheduleKind);
    if (preset.scheduleKind === 'interval_minutes') {
      const n = preset.intervalMinutes;
      setIntervalMinutes(
        n === 5 || n === 15 || n === 30 || n === 60 ? n : 30,
      );
      setDailyTime('09:00');
    } else {
      setDailyTime(preset.dailyTime ?? '09:00');
      setIntervalMinutes(15);
    }
    setTitleTemplate(preset.titleTemplate);
    setBodyTemplate(preset.bodyTemplate);
    // 保留已选 assignee（若有）；默认第一个 agent
    setAssigneeValue((prev) => {
      if (prev) return prev;
      if (agents[0]?.id) return `agent:${agents[0].id}`;
      if (squads[0]?.id) return `squad:${squads[0].id}`;
      return '';
    });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();

    let assigneeType: 'agent' | 'squad';
    let assigneeId: string;
    if (assigneeValue.startsWith('agent:')) {
      assigneeType = 'agent';
      assigneeId = assigneeValue.slice('agent:'.length);
    } else if (assigneeValue.startsWith('squad:')) {
      assigneeType = 'squad';
      assigneeId = assigneeValue.slice('squad:'.length);
    } else {
      setFieldErrors({ assignee: '请选择要指派的 agent 或小队' });
      return;
    }

    // W3：提交前用 CreateAutomationRuleInput 校验；不过则显示字段级 FieldError
    const validated = validateWith(CreateAutomationRuleInput, {
      name: name.trim(),
      enabled: true,
      scheduleKind,
      intervalMinutes: scheduleKind === 'interval_minutes' ? intervalMinutes : null,
      dailyTime: scheduleKind === 'daily_at' ? dailyTime : null,
      cronExpression: scheduleKind === 'cron' ? cronExpression : null,
      assigneeType,
      assigneeId,
      titleTemplate: titleTemplate.trim(),
      bodyTemplate: bodyTemplate,
      executionMode,
    });
    if (!validated.ok) {
      // 表单用 assigneeValue 承载指派，把 schema 的 assigneeId 错误映射到该字段
      const errors: FieldErrors = {};
      for (const [key, message] of Object.entries(validated.errors)) {
        errors[key === 'assigneeId' ? 'assignee' : key] = message;
      }
      setFieldErrors(errors);
      return;
    }

    create.mutate(validated.data, {
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
    setExpandedRuns(null);
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

  function handleArchive(rule: AutomationRule) {
    void (async () => {
      const ok = await confirmDialog({
        title: '归档自动化规则？',
        description: `确定归档规则「${rule.name}」？将停止后续计划，保留已有执行记录。`,
        confirmLabel: '归档',
        variant: 'danger',
      });
      if (!ok) return;
      archive.mutate(rule.id, {
        onSuccess: () => {
          if (expandedRuns?.ruleId === rule.id) setExpandedRuns(null);
        },
      });
    })();
  }

  function handleRunNow(rule: AutomationRule) {
    runNow.mutate(rule.id, {
      onSuccess: (run) => {
        // HTTP 201 includes both successful dispatch and persisted domain failures.
        // A non-success result belongs next to this rule's existing recent-run repair UI.
        if (classifyAutomationRunNowOutcome(run.status) !== 'success') {
          setEditingId(null);
          setExpandedRuns({
            ruleId: rule.id,
            limit: RECENT_RUNS_LIMIT,
            focusSkipped: false,
            skippedFocusRequest: 0,
          });
        }
      },
    });
  }

  function showSkippedDrilldown(rule: AutomationRule) {
    setEditingId(null);
    setExpandedRuns((previous) => ({
      ruleId: rule.id,
      limit: SKIPPED_STREAK_WINDOW,
      focusSkipped: true,
      skippedFocusRequest: (previous?.skippedFocusRequest ?? 0) + 1,
    }));
  }

  function toggleRecentRuns(rule: AutomationRule) {
    if (expandedRuns?.ruleId === rule.id) {
      setExpandedRuns(null);
      return;
    }
    setEditingId(null);
    setExpandedRuns({
      ruleId: rule.id,
      limit: RECENT_RUNS_LIMIT,
      focusSkipped: false,
      skippedFocusRequest: 0,
    });
  }

  function toggleWebhook(rule: AutomationRule) {
    setWebhookRuleId((prev) => (prev === rule.id ? null : rule.id));
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
    <div className="page-container automation-page collection-page" data-testid="automation-page">
      <div className="page-header">
        <div>
          <Icon name="automation" size={16} className="page-header-icon" />
          <h1 className="page-title">
            自动化
            <span className="count" data-testid="automation-visible-count">
              {hasActiveFilters ? `${visible.length}/${rules.length}` : rules.length}
            </span>
          </h1>
          <p className="page-desc">为智能体安排周期性任务；可从模板开始</p>
        </div>
        <div className="page-actions">
          <PageHeaderMore testId="automation-header-more">
            <Link
              href="/?origin=automation"
              data-testid="automation-to-board-origin"
              role="menuitem"
              title="看板筛选自动化创建的 Issue"
            >
              看板 · 自动化 Issue
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? '刷新中…' : '刷新'}
            </button>
          </PageHeaderMore>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="automation-new-blank"
            onClick={() => {
              if (open) setOpen(false);
              else applyPreset(null);
            }}
          >
            {open ? '收起' : '从空白开始'}
          </button>
        </div>
      </div>

      <div className="page-body">
      {/* Multica 风格模板画廊：有规则时也可折叠使用；默认空态突出 */}
      <section
        className="automation-template-gallery"
        data-testid="automation-template-gallery"
        aria-label="自动化模板"
      >
        <div className="automation-template-gallery-head">
          <h2 className="settings-section-title">从模板开始</h2>
          <p className="settings-section-desc">
            对齐 Multica Autopilot 画廊；点卡片预填规则（webhook 不做）
          </p>
        </div>
        <div className="automation-template-grid">
          {AUTOMATION_PRESETS.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="automation-template-card"
              data-testid={`automation-preset-${tpl.id}`}
              data-preset={tpl.id}
              onClick={() => applyPreset(tpl)}
            >
              <div className="automation-template-card-title">{tpl.title}</div>
              <div className="automation-template-card-summary">{tpl.summary}</div>
              <div className="automation-template-card-meta text-dim text-sm">
                {tpl.scheduleKind === 'daily_at'
                  ? `每天 ${tpl.dailyTime}`
                  : `每 ${tpl.intervalMinutes} 分钟`}
              </div>
            </button>
          ))}
        </div>
      </section>

      {open && (
        <form className="ops-form surface-card" onSubmit={submit} data-testid="automation-create-form">
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>名称</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((prev) => (prev.name ? { ...prev, name: '' } : prev));
                }}
                placeholder="如：每 15 分钟巡检"
                required
                autoFocus
                maxLength={80}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? 'automation-create-name-error' : undefined}
              />
              {fieldErrors.name ? (
                <FieldError id="automation-create-name-error" message={fieldErrors.name} dataTestId="automation-create-name-error" />
              ) : null}
            </label>
            <label className="ops-field">
              <span>调度类型</span>
              <Select
                value={scheduleKind}
                onChange={(e) =>
                  setScheduleKind(e.target.value as AutomationScheduleKind)
                }
              >
                <option value="interval_minutes">固定间隔</option>
                <option value="daily_at">每日时刻</option>
                <option value="cron">Cron 表达式</option>
              </Select>
            </label>
            {scheduleKind === 'interval_minutes' ? (
              <label className="ops-field">
                <span>间隔（分钟）</span>
                <Select
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
                </Select>
              </label>
            ) : scheduleKind === 'daily_at' ? (
              <label className="ops-field">
                <span>每日时刻（本地 HH:mm）</span>
                <input
                  type="time"
                  value={dailyTime}
                  onChange={(e) => {
                    setDailyTime(e.target.value);
                    setFieldErrors((prev) => (prev.dailyTime ? { ...prev, dailyTime: '' } : prev));
                  }}
                  required
                  aria-invalid={fieldErrors.dailyTime ? true : undefined}
                  aria-describedby={fieldErrors.dailyTime ? 'automation-create-daily-error' : undefined}
                />
                {fieldErrors.dailyTime ? (
                  <FieldError id="automation-create-daily-error" message={fieldErrors.dailyTime} dataTestId="automation-create-daily-error" />
                ) : null}
              </label>
            ) : (
              <label className="ops-field">
                <span>Cron 表达式</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    value={cronExpression}
                    onChange={(e) => {
                      setCronExpression(e.target.value);
                      setFieldErrors((prev) => (prev.cronExpression ? { ...prev, cronExpression: '' } : prev));
                    }}
                    placeholder="如 0 9 * * 1-5"
                    required
                    aria-invalid={fieldErrors.cronExpression ? true : undefined}
                    aria-describedby={fieldErrors.cronExpression ? 'automation-create-cron-error' : undefined}
                  />
                  {fieldErrors.cronExpression ? (
                    <FieldError id="automation-create-cron-error" message={fieldErrors.cronExpression} dataTestId="automation-create-cron-error" />
                  ) : null}
                  <div className="automation-cron-chips">
                    {['*/15 * * * *', '0 * * * *', '0 9 * * 1-5'].map(chip => (
                      <button type="button" key={chip} className="btn-ghost btn-sm" style={{ padding: '0 4px', fontSize: 12, marginRight: 4 }} onClick={() => setCronExpression(chip)}>{chip}</button>
                    ))}
                  </div>
                  {cronPreview && (
                    <div className="text-dim text-sm" style={{ marginTop: 4 }}>
                      {cronPreview.success ? (
                        <>未来 5 次：{cronPreview.nextRuns?.map(t => new Date(t).toLocaleString()).join('、')}</>
                      ) : (
                        <span className="text-error">{cronPreview.error || '无效的 cron'}</span>
                      )}
                    </div>
                  )}
                </div>
              </label>
            )}
            <label className="ops-field">
              <span>指派给</span>
              <AssigneeCombobox
                value={assigneeValue}
                onChange={(next) => {
                  setAssigneeValue(next);
                  setFieldErrors((prev) => (prev.assignee ? { ...prev, assignee: '' } : prev));
                }}
                agents={agents}
                squads={squads}
                readinessMap={readinessMap}
                agentNameById={agentNameById}
                listboxId="automation-create-assignee-listbox"
                selectTestId="automation-create-assignee"
                searchTestId="automation-create-assignee-search"
                searchAriaLabel="搜索自动化指派对象"
              />
              {fieldErrors.assignee ? (
                <FieldError id="automation-create-assignee-error" message={fieldErrors.assignee} dataTestId="automation-create-assignee-error" />
              ) : null}
            </label>
          </div>
          <label className="ops-field">
            <span>执行模式</span>
            <Select
              value={executionMode}
              data-testid="automation-execution-mode"
              onChange={(e) =>
                setExecutionMode(e.target.value as 'create_issue' | 'run_only')
              }
              aria-label="自动化执行模式"
            >
              <option value="create_issue">建 Issue 并派活</option>
              <option value="run_only">仅派活（不建 Issue）</option>
            </Select>
            <span className="text-dim text-sm">
              对齐 Multica Autopilot：run_only 适合定时巡检，不产生看板卡片
            </span>
          </label>
          <label className="ops-field">
            <span>标题模板</span>
            <input
              value={titleTemplate}
              onChange={(e) => {
                setTitleTemplate(e.target.value);
                setFieldErrors((prev) => (prev.titleTemplate ? { ...prev, titleTemplate: '' } : prev));
              }}
              placeholder="巡检 {{date}} {{time}}"
              required
              maxLength={200}
              aria-invalid={fieldErrors.titleTemplate ? true : undefined}
              aria-describedby={fieldErrors.titleTemplate ? 'automation-create-title-template-error' : undefined}
            />
            {fieldErrors.titleTemplate ? (
              <FieldError id="automation-create-title-template-error" message={fieldErrors.titleTemplate} dataTestId="automation-create-title-template-error" />
            ) : null}
          </label>
          <label className="ops-field">
            <span>描述模板</span>
            <textarea
              className="ops-textarea"
              rows={3}
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              placeholder="支持 {{date}} {{time}} {{iso_time}} {{rule_name}} {{webhook.event}}"
            />
          </label>
          <p className="automation-template-hint text-dim text-sm">
            占位符：
            <code>{'{{date}}'}</code> <code>{'{{time}}'}</code>{' '}
            <code>{'{{iso_time}}'}</code> <code>{'{{rule_name}}'}</code>{' '}
            <code>{'{{webhook.event}}'}</code> <code>{'{{webhook.payload}}'}</code>{' '}
            <code>{'{{webhook.payload.<字段>}}'}</code>
            （大小写敏感；webhook 变量仅在 Webhook 触发时有值，定时/手动触发渲染为空）
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
              // W3：校验错误用 FieldError 展示，按钮只在提交中禁用
              disabled={create.isPending}
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
          description="从上方模板一键预填，或从空白开始；创建后可「立即执行」。"
          action={
            <div className="automation-empty-actions" data-testid="automation-empty-actions">
              {!open ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="automation-empty-create"
                  onClick={() => applyPreset(null)}
                >
                  从空白开始
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
          <div className="agents-filters collection-toolbar" data-testid="automation-filters">
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
              <Select
                value={enabledFromUrl}
                data-testid="automation-enabled-filter"
                onChange={(e) => replaceParams({ enabled: e.target.value || null })}
                aria-label="按启用状态筛选"
              >
                <option value="">全部</option>
                <option value="on">已启用</option>
                <option value="off">已停用</option>
              </Select>
            </label>
            <label className="agents-filter-field">
              调度
              <Select
                value={scheduleFromUrl}
                data-testid="automation-schedule-filter"
                onChange={(e) => replaceParams({ schedule: e.target.value || null })}
                aria-label="按调度类型筛选"
              >
                <option value="">全部</option>
                <option value="interval_minutes">间隔</option>
                <option value="daily_at">每日</option>
                <option value="cron">Cron</option>
              </Select>
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
                  调度 · {scheduleFromUrl === 'interval_minutes' ? '间隔' : scheduleFromUrl === 'cron' ? 'Cron' : '每日'} ×
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
              const expanded = expandedRuns?.ruleId === rule.id;
              const webhookOpen = webhookRuleId === rule.id;
              const archivedTarget = archivedTargetLabel(rule);
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
                      <div className="automation-rule-name">
                        {rule.name}
                        <span
                          className="text-dim text-sm"
                          data-testid={`automation-mode-${rule.id}`}
                          style={{ marginLeft: 8, fontWeight: 400 }}
                        >
                          {rule.executionMode === 'run_only' ? '· 仅派活' : '· 建 Issue'}
                        </span>
                      </div>
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
                        {rule.assigneeType === 'agent' ? (
                          <>
                            <Link
                              href={`/agents/${rule.assigneeId}`}
                              data-testid="automation-assignee-detail"
                              title="打开智能体"
                            >
                              智能体 · {assigneeLabel(rule)}
                            </Link>
                            <Link
                              href={`/?assignee=agent:${encodeURIComponent(rule.assigneeId)}`}
                              className="runs-inline-filter"
                              data-testid="automation-assignee-board"
                              title="看板筛选此智能体"
                            >
                              看板
                            </Link>
                          </>
                        ) : (
                          <>
                            <Link
                              href={`/squads/${rule.assigneeId}`}
                              data-testid="automation-assignee-detail"
                              title="打开小队"
                            >
                              小队 · {assigneeLabel(rule)}
                            </Link>
                            <Link
                              href={`/?assignee=squad:${encodeURIComponent(rule.assigneeId)}`}
                              className="runs-inline-filter"
                              data-testid="automation-assignee-board"
                              title="看板筛选此小队"
                            >
                              看板
                            </Link>
                          </>
                        )}
                        {archivedTarget ? (
                          <span
                            className="text-dim text-sm"
                            data-testid={`automation-archived-target-${rule.id}`}
                            title="归档 Agent 不会接收新的自动化派发；立即执行会记录已跳过原因。"
                          >
                            {archivedTarget}
                          </span>
                        ) : null}
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
                      {(rule.skippedStreak ?? 0) >= 3 ? (
                        <>
                          <button
                            type="button"
                            className="automation-skip-warning"
                            data-testid={`automation-skipped-streak-${rule.id}`}
                            data-count={String(rule.skippedStreak)}
                            aria-expanded={expanded}
                            aria-controls={`automation-rule-runs-${rule.id}`}
                            aria-describedby={
                              (rule.skippedStreak ?? 0) >= SKIPPED_STREAK_WINDOW
                                ? `automation-skipped-window-note-${rule.id}`
                                : undefined
                            }
                            title={
                              (rule.skippedStreak ?? 0) >= SKIPPED_STREAK_WINDOW
                                ? '连续跳过通常表示没有匹配到可执行目标，或规则配置已失效；仅基于最近 20 条执行记录'
                                : '连续跳过通常表示没有匹配到可执行目标，或规则配置已失效'
                            }
                            onClick={() => showSkippedDrilldown(rule)}
                          >
                            ⚠ {skippedStreakLabel(rule.skippedStreak ?? 0)}
                          </button>
                          {skippedStreakWindowNote(rule.skippedStreak ?? 0) ? (
                            <span
                              id={`automation-skipped-window-note-${rule.id}`}
                              className="automation-skipped-window-note text-dim text-sm"
                              data-testid={`automation-skipped-window-note-${rule.id}`}
                            >
                              {skippedStreakWindowNote(rule.skippedStreak ?? 0)}
                            </span>
                          ) : null}
                        </>
                      ) : (rule.failCount ?? 0) > 0 ? (
                        <Link
                          href="/automation?failed=1"
                          className="automation-fail-count automation-fail-count--link"
                          data-testid="automation-fail-count"
                          data-count={String(rule.failCount ?? 0)}
                          title={`失败 ${rule.failCount} 次 · 筛选失败规则`}
                        >
                          失败 {rule.failCount}
                        </Link>
                      ) : (
                        <span className="text-dim" data-testid="automation-fail-count" data-count="0">
                          {rule.lastRunStatus
                            ? `最近 ${AUTOMATION_RUN_STATUS_LABEL[rule.lastRunStatus] ?? rule.lastRunStatus}`
                            : '—'}
                        </span>
                      )}
                      <div className="automation-row-links">
                        <Link
                          href="/?origin=automation"
                          className="runs-inline-filter"
                          data-testid="automation-row-board-origin"
                          title="看板：自动化 Issue"
                        >
                          看板来源
                        </Link>
                        <Link
                          href={
                            rule.enabled
                              ? '/automation?enabled=on'
                              : '/automation?enabled=off'
                          }
                          className="runs-inline-filter"
                          data-testid="automation-row-enabled-filter"
                          title="筛选同启用状态"
                        >
                          {rule.enabled ? '已启用' : '已停用'}
                        </Link>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        data-testid={`automation-run-now-${rule.id}`}
                        disabled={runNow.isPending}
                        onClick={() => handleRunNow(rule)}
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
                          toggleRecentRuns(rule);
                        }}
                      >
                        {expanded ? '收起记录' : '最近执行'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        data-testid={`automation-webhook-toggle-${rule.id}`}
                        aria-expanded={webhookOpen}
                        onClick={() => toggleWebhook(rule)}
                      >
                        {webhookOpen ? '收起 Webhook' : 'Webhook'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        data-testid={`automation-archive-${rule.id}`}
                        disabled={archive.isPending}
                        onClick={() => handleArchive(rule)}
                      >
                        归档
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
                        <RuleRuns
                          ruleId={rule.id}
                          limit={expandedRuns?.limit ?? RECENT_RUNS_LIMIT}
                          focusSkipped={expandedRuns?.focusSkipped ?? false}
                          skippedFocusRequest={expandedRuns?.skippedFocusRequest ?? 0}
                        />
                      </td>
                    </tr>
                  ) : null}
                  {webhookOpen ? (
                    <tr className="automation-webhook-row">
                      <td colSpan={8}>
                        <RuleWebhookSection rule={rule} />
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
