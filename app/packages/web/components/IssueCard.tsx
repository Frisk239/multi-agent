'use client';

import React from 'react';
import Link from 'next/link';
import type { AgentReadiness, Issue, IssueStatus } from '@ma/shared';
import { deriveIssueCardLive } from '@/lib/issue-card-live';
import { IssueCardMenu } from './IssueCardMenu';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

/** Multica card.updated_ago：更新于 N 天前 */
function updatedAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

function descriptionPreview(md: string | null | undefined): string {
  if (!md) return '';
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Props {
  issue: Issue;
  onDragStart?: (id: string) => void;
  /** 指派 agent（或 squad leader）的 readiness */
  readiness?: AgentReadiness | null;
  /** 最近一条 run 是否失败 */
  lastRunFailed?: boolean;
  /** 是否有 queued/running run */
  runActive?: boolean;
  /** 是否被选中 */
  selected?: boolean;
  /** 选中状态改变 */
  onToggleSelect?: (id: string, checked: boolean) => void;
  /**
   * Slice 32：主标题点击打开侧滑时的 href（`?issue=`）。
   * 不传则仍走全页 `/issues/[id]`。
   */
  detailHref?: string;
  /** 主标题点击（侧滑打开）；不传则走默认 Link 导航 */
  onOpenDetail?: (issueId: string, e?: React.MouseEvent) => void;
}

/**
 * Multica board-card 布局：
 * 行1 identifier + 右侧徽章
 * 行2 title
 * 行3 description 一行预览
 * 行4 project/labels
 * 行5 assignee · 更新于
 * 参考 references/repos/multica/packages/views/issues/components/board-card.tsx
 */
export const IssueCard = React.memo(function IssueCard({
  issue,
  onDragStart,
  readiness,
  lastRunFailed,
  runActive,
  selected,
  onToggleSelect,
  detailHref: detailHrefProp,
  onOpenDetail,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: { type: 'Issue', issue },
  });

  const tone = readinessTone(readiness);
  const showReadyDot = Boolean(
    issue.assignee?.type === 'agent' || issue.assignee?.type === 'squad',
  );
  const liveState = deriveIssueCardLive({
    activeRuns: runActive,
    recentFailed: lastRunFailed,
  });
  const showLive = liveState.live;
  const showFail = liveState.showFailed;
  const desc = descriptionPreview(issue.description);
  const updated = updatedAgo(issue.updatedAt);
  const fullPageHref = showLive
    ? `/issues/${issue.id}#run-trace`
    : `/issues/${issue.id}`;
  // 默认全页深链；看板传入 detailHref/onOpenDetail 走侧滑
  const detailHref = detailHrefProp ?? fullPageHref;
  // 失败区优先走看板侧滑（?issue=）；无 onOpenDetail 时退回全页
  const failHref = detailHrefProp ?? `/issues/${issue.id}`;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <IssueCardMenu issue={issue}>
      <article
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={[
          'issue-card',
          showFail ? 'issue-card--run-failed' : '',
          showLive ? 'issue-card--run-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid="issue-card"
        data-issue-id={issue.id}
        data-readiness={showReadyDot ? tone : 'none'}
        data-run-failed={showFail ? '1' : '0'}
        data-run-active={showLive ? '1' : '0'}
        data-live={showLive ? '1' : '0'}
        data-origin={issue.originType ?? ''}
      >
        <div className="issue-card-top" style={{ display: 'flex', alignItems: 'center' }}>
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={selected || false}
              onPointerDown={(e) => e.stopPropagation()} // Prevent drag
              onChange={(e) => onToggleSelect(issue.id, e.target.checked)}
              className="mr-2"
              style={{ cursor: 'pointer' }}
            />
          )}
          <div className="issue-card-id-row">
            {issue.priority !== 'none' ? (
              <Link
                href={`/?priority=${encodeURIComponent(issue.priority)}`}
                className="issue-card-priority-dot"
                title={`优先级：${PRIORITY_LABEL[issue.priority]}`}
                data-testid="issue-card-priority-link"
                data-priority={issue.priority}
                onClick={(e) => e.stopPropagation()}
                draggable={false}
                style={{ background: PRIORITY_COLOR[issue.priority] }}
              />
            ) : null}
            <span
              className="issue-card-id"
              style={{ color: STATUS_COLORS[issue.status] }}
            >
              {issue.identifier}
            </span>
          </div>
          <span className="issue-card-top-right">
            {issue.parentIdentifier ? (
              <Link
                href={`/issues/${issue.parentIssueId}`}
                className="issue-card-parent"
                title={`父 issue：${issue.parentIdentifier}`}
                data-testid="issue-card-parent"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              >
                ↳ {issue.parentIdentifier}
              </Link>
            ) : null}
            {issue.childProgress && issue.childProgress.total > 0 ? (
              <span
                className="issue-card-children"
                title={`子 issue ${issue.childProgress.done}/${issue.childProgress.total} 完成`}
                data-testid="issue-card-children"
              >
                {issue.childProgress.done}/{issue.childProgress.total}
              </span>
            ) : null}
            {showLive ? (
              <span
                className="issue-card-run-active"
                title="运行中 / 排队中"
                data-testid="issue-card-live"
                data-live="1"
              >
                运行中
              </span>
            ) : null}
            {showFail ? (
              <Link
                href={failHref}
                className="issue-card-run-fail issue-card-run-fail--link"
                title="最近一次运行失败 · 打开详情"
                data-testid="issue-card-fail-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenDetail) {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    onOpenDetail(issue.id, e);
                  }
                }}
                draggable={false}
              >
                失败
              </Link>
            ) : null}
            {issue.originType === 'automation' ||
            issue.originType === 'quick_create' ? (
              <Link
                href={`/?origin=${encodeURIComponent(issue.originType)}`}
                className="issue-card-origin"
                data-testid="issue-card-origin"
                data-origin={issue.originType}
                title={
                  issue.originType === 'automation'
                    ? '看板筛选：自动化 Issue'
                    : '看板筛选：快速派活 Issue'
                }
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              >
                {issue.originType === 'automation' ? '自动' : 'QC'}
              </Link>
            ) : null}
          </span>
        </div>

        <div className="issue-card-title">
          <Link
            href={detailHref}
            data-testid="issue-card-title-link"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenDetail) {
                // 保留修饰键新标签 / 中键默认行为
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  return;
                }
                e.preventDefault();
                onOpenDetail(issue.id, e);
              }
            }}
            draggable={false}
          >
            {issue.title}
          </Link>
        </div>

        {desc ? (
          <p className="issue-card-desc" title={desc}>
            {desc}
          </p>
        ) : null}

        {(issue.projectTitle || (issue.labels ?? []).length > 0) && (
          <div className="issue-card-chips">
            {issue.projectTitle ? (
              <Link
                href={`/?project=${encodeURIComponent(issue.projectId ?? '')}`}
                className="issue-card-project"
                title={`项目：${issue.projectTitle}`}
                data-testid="issue-card-project"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              >
                {issue.projectTitle}
              </Link>
            ) : null}
            {(issue.labels ?? []).map((l) => (
              <Link
                key={l.id}
                href={`/?label=${encodeURIComponent(l.id)}`}
                className="issue-label-chip issue-label-chip--sm issue-label-chip--link"
                style={{ ['--label-color' as string]: l.color }}
                title={`看板筛选：${l.name}`}
                data-testid="issue-card-label-link"
                data-label-id={l.id}
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              >
                <span className="issue-label-dot" />
                {l.name}
              </Link>
            ))}
          </div>
        )}

        <div className="issue-card-meta">
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
              <span className="issue-card-assignee-empty">未指派</span>
            )}
            {showLive ? (
              <Link
                href={detailHref}
                className="issue-card-live-link"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenDetail) {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    onOpenDetail(issue.id, e);
                  }
                }}
                draggable={false}
                data-testid="issue-card-live-link"
                title="打开详情并定位到运行轨迹"
              >
                进度
              </Link>
            ) : null}
            {showFail ? (
              <Link
                href={failHref}
                className="issue-card-fail-link"
                data-testid="issue-card-fail-link"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenDetail) {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                      return;
                    }
                    e.preventDefault();
                    onOpenDetail(issue.id, e);
                  }
                }}
                draggable={false}
                title="打开详情查看失败诊断与再执行"
              >
                诊断
              </Link>
            ) : null}
          </div>
          {updated ? (
            <span className="issue-card-updated" title={issue.updatedAt ?? ''}>
              更新于 {updated}
            </span>
          ) : null}
        </div>
      </article>
    </IssueCardMenu>
  );
}, (prev, next) => {
  return prev.issue.id === next.issue.id &&
         prev.issue.updatedAt === next.issue.updatedAt &&
         prev.selected === next.selected &&
         prev.runActive === next.runActive &&
         prev.lastRunFailed === next.lastRunFailed &&
         prev.detailHref === next.detailHref &&
         prev.onOpenDetail === next.onOpenDetail;
});
