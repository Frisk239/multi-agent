'use client';

import Link from 'next/link';
import type { AgentReadiness, Issue, IssueStatus } from '@ma/shared';

const STATUS_COLORS: Record<IssueStatus, string> = {
  backlog: 'var(--status-backlog)',
  todo: 'var(--status-todo)',
  in_progress: 'var(--status-in-progress)',
  in_review: 'var(--status-in-review)',
  done: 'var(--status-done)',
  blocked: 'var(--status-blocked)',
  cancelled: 'var(--status-cancelled)',
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
  none: '',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--color-red)',
  high: 'var(--color-orange)',
  medium: 'var(--color-yellow)',
  low: 'var(--color-blue)',
  none: 'transparent',
};

function readinessTone(
  rd: AgentReadiness | null | undefined,
): 'ok' | 'warn' | 'bad' | 'idle' {
  if (!rd) return 'idle';
  if (rd.status === 'ready') return 'ok';
  if (rd.status === 'busy') return 'warn';
  return 'bad';
}

function readinessTitle(rd: AgentReadiness | null | undefined): string {
  if (!rd) return '就绪未知';
  if (rd.status === 'ready') return '就绪';
  if (rd.status === 'busy') return rd.detail ?? '忙碌';
  if (rd.status === 'cwd_missing') return rd.detail ?? 'cwd 未配置';
  if (rd.status === 'runtime_missing') return rd.detail ?? 'runtime 缺失';
  return rd.detail ?? rd.status;
}

interface Props {
  issue: Issue;
  onDragStart: (id: string) => void;
  /** 指派 agent（或 squad leader）的 readiness */
  readiness?: AgentReadiness | null;
  /** 最近一条 run 是否失败 */
  lastRunFailed?: boolean;
  /** 是否有 queued/running run */
  runActive?: boolean;
}

export function IssueCard({
  issue,
  onDragStart,
  readiness,
  lastRunFailed,
  runActive,
}: Props) {
  const tone = readinessTone(readiness);
  const showReadyDot = Boolean(issue.assignee?.type === 'agent' || issue.assignee?.type === 'squad');
  // 活跃优先于失败标记（失败是历史；running 是当下）
  const showFail = Boolean(lastRunFailed) && !runActive;

  return (
    <article
      draggable
      onDragStart={() => onDragStart(issue.id)}
      className={[
        'issue-card',
        showFail ? 'issue-card--run-failed' : '',
        runActive ? 'issue-card--run-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="issue-card"
      data-issue-id={issue.id}
      data-readiness={showReadyDot ? tone : 'none'}
      data-run-failed={showFail ? '1' : '0'}
      data-run-active={runActive ? '1' : '0'}
      data-origin={issue.originType ?? ''}
    >
      <div className="issue-card-top">
        <span className="issue-card-id" style={{ color: STATUS_COLORS[issue.status] }}>
          {issue.identifier}
        </span>
        <span className="issue-card-top-right">
          {runActive ? (
            <span className="issue-card-run-active" title="运行中 / 排队中">
              运行中
            </span>
          ) : null}
          {showFail ? (
            <span className="issue-card-run-fail" title="最近一次运行失败">
              失败
            </span>
          ) : null}
          {issue.originType === 'automation' ? (
            <span
              className="issue-card-origin"
              data-testid="issue-card-origin"
              data-origin="automation"
              title="自动化创建"
            >
              自动
            </span>
          ) : issue.originType === 'quick_create' ? (
            <span
              className="issue-card-origin"
              data-testid="issue-card-origin"
              data-origin="quick_create"
              title="快速派活创建"
            >
              QC
            </span>
          ) : null}
          {issue.priority !== 'none' && (
            <span className="issue-card-priority">
              <span
                className="priority-dot"
                style={{ background: PRIORITY_COLOR[issue.priority] }}
              />
              {PRIORITY_LABEL[issue.priority]}
            </span>
          )}
        </span>
      </div>
      <div className="issue-card-title">
        <Link
          href={runActive ? `/issues/${issue.id}#run-trace` : `/issues/${issue.id}`}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        >
          {issue.title}
        </Link>
      </div>
      {(issue.labels ?? []).length > 0 && (
        <div className="issue-card-labels">
          {(issue.labels ?? []).map((l) => (
            <span
              key={l.id}
              className="issue-label-chip issue-label-chip--sm"
              style={{ ['--label-color' as string]: l.color }}
              title={l.name}
            >
              <span className="issue-label-dot" />
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="issue-card-assignee">
        {showReadyDot ? (
          <span
            className={`issue-card-ready issue-card-ready--${tone}`}
            title={readinessTitle(readiness)}
            data-testid="issue-card-ready"
            aria-label={readinessTitle(readiness)}
          />
        ) : null}
        {issue.assignee?.type === 'agent' ? (
          <Link
            href={`/agents/${issue.assignee.id}`}
            className="issue-card-assignee-link"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            data-testid="issue-card-assignee-link"
            data-assignee-type="agent"
            data-assignee-id={issue.assignee.id}
            title="打开智能体"
          >
            {issue.assignee.label}
          </Link>
        ) : issue.assignee?.type === 'squad' ? (
          <Link
            href={`/squads/${issue.assignee.id}`}
            className="issue-card-assignee-link"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            data-testid="issue-card-assignee-link"
            data-assignee-type="squad"
            data-assignee-id={issue.assignee.id}
            title="打开小队"
          >
            {issue.assignee.label}
          </Link>
        ) : (
          <span>{issue.assignee ? issue.assignee.label : '未指派'}</span>
        )}
        {runActive ? (
          <Link
            href={`/issues/${issue.id}#run-trace`}
            className="issue-card-live-link"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            data-testid="issue-card-live-link"
            title="打开详情并定位到运行轨迹"
          >
            进度
          </Link>
        ) : null}
        {showFail ? (
          <Link
            href={`/issues/${issue.id}`}
            className="issue-card-fail-link"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            title="打开详情查看失败诊断与再执行"
          >
            诊断
          </Link>
        ) : null}
      </div>
    </article>
  );
}
