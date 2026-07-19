'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Issue, IssueStatus, Priority } from '@ma/shared';
import { IssueStatus as IssueStatusEnum, Priority as PriorityEnum } from '@ma/shared';
import {
  useIssueSubscription,
  useProjects,
  useToggleIssueSubscription,
  useUpdateIssue,
} from '@/lib/api';
import { AssigneeSelect } from './AssigneeSelect';
import { IssueLabelsEditor } from './IssueLabelsEditor';
import { MarkdownBody } from './MarkdownBody';
import { Icon } from './Icon';

const ALL_STATUS = IssueStatusEnum.options;
const ALL_PRIORITY = PriorityEnum.options;

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

const PRIORITY_ZH: Record<Priority, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
  none: '无',
};

export function IssueHeader({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();
  const { data: projects = [] } = useProjects();
  const { data: subscription } = useIssueSubscription(issue.id);
  const toggleSub = useToggleIssueSubscription(issue.id);
  const subscribed = subscription?.subscribed ?? false;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(issue.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(issue.description ?? '');

  // 服务端/WS 更新时同步草稿（非编辑中）
  useEffect(() => {
    if (!editingTitle) setTitleDraft(issue.title);
  }, [issue.title, editingTitle]);

  useEffect(() => {
    if (!editingDesc) setDescDraft(issue.description ?? '');
  }, [issue.description, editingDesc]);

  function saveTitle() {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(issue.title);
      setEditingTitle(false);
      return;
    }
    if (next === issue.title) {
      setEditingTitle(false);
      return;
    }
    update.mutate(
      { id: issue.id, input: { title: next } },
      { onSuccess: () => setEditingTitle(false) },
    );
  }

  function cancelTitle() {
    setTitleDraft(issue.title);
    setEditingTitle(false);
  }

  function saveDesc() {
    const next = descDraft;
    const prev = issue.description ?? '';
    if (next === prev) {
      setEditingDesc(false);
      return;
    }
    // 清空 → null，与 API nullable 一致
    const description = next.trim() === '' ? null : next;
    update.mutate(
      { id: issue.id, input: { description } },
      { onSuccess: () => setEditingDesc(false) },
    );
  }

  function cancelDesc() {
    setDescDraft(issue.description ?? '');
    setEditingDesc(false);
  }

  return (
    <header className="issue-header">
      {issue.parentIssueId ? (
        <div className="issue-parent-crumb" data-testid="issue-parent-crumb">
          <Link href={`/issues/${issue.parentIssueId}`} className="issue-parent-link">
            {issue.parentIdentifier ?? '父 issue'}
          </Link>
          <span className="issue-parent-sep" aria-hidden>
            /
          </span>
          <span className="issue-parent-current">{issue.identifier}</span>
        </div>
      ) : null}
      <div className="issue-header-top">
        <Link href="/" className="back-link">
          <Icon name="arrow-left" size={16} />
          看板
        </Link>
        <span className="issue-id">{issue.identifier}</span>
        {issue.originType === 'automation' ? (
          <span className="issue-origin-badge-group" data-testid="issue-origin-badge-group">
            <Link
              href="/?origin=automation"
              className="issue-origin-badge"
              data-testid="issue-origin-badge"
              data-origin="automation"
              title="看板筛选：自动化 Issue"
            >
              来源 · 自动化
            </Link>
            <Link
              href="/automation"
              className="issue-origin-side-link"
              data-testid="issue-origin-to-automation"
              title={issue.originRuleId ? `规则 ${issue.originRuleId}` : '打开自动化'}
            >
              规则
            </Link>
          </span>
        ) : issue.originType === 'quick_create' ? (
          <span className="issue-origin-badge-group" data-testid="issue-origin-badge-group">
            <Link
              href="/?origin=quick_create"
              className="issue-origin-badge"
              data-testid="issue-origin-badge"
              data-origin="quick_create"
              title="看板筛选：快速派活 Issue"
            >
              来源 · 快速派活
            </Link>
            {issue.originRunId ? (
              <Link
                href={`/runs?run=${encodeURIComponent(issue.originRunId)}&status=all`}
                className="issue-origin-side-link"
                data-testid="issue-origin-to-run"
                title={`QC run ${issue.originRunId}`}
              >
                运行
              </Link>
            ) : null}
          </span>
        ) : null}
        <button
          type="button"
          className={`issue-subscribe-btn${subscribed ? ' issue-subscribe-btn--on' : ''}`}
          data-testid="issue-subscribe-btn"
          data-subscribed={subscribed ? '1' : '0'}
          disabled={toggleSub.isPending || subscription == null}
          title={
            subscribed
              ? `已关注${subscription?.reason ? `（${subscription.reason}）` : ''} · 点击取消`
              : '关注后接收此 Issue 相关 Inbox 通知'
          }
          onClick={() => toggleSub.mutate(subscribed)}
        >
          {subscribed ? '取消关注' : '关注'}
        </button>
        <span className="issue-status-field">
          <select
            className="status-select"
            value={issue.status}
            onChange={(e) =>
              update.mutate({ id: issue.id, input: { status: e.target.value as IssueStatus } })
            }
            aria-label="状态"
          >
            {ALL_STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_ZH[s]}
              </option>
            ))}
          </select>
          {issue.status !== 'cancelled' ? (
            <Link
              href={`/?status=${encodeURIComponent(issue.status)}`}
              className="issue-status-board-link"
              data-testid="issue-status-board-link"
              data-status={issue.status}
              title={`看板聚焦：${STATUS_ZH[issue.status]}`}
            >
              看板
            </Link>
          ) : null}
        </span>
      </div>

      {editingTitle ? (
        <input
          className="issue-title-input"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveTitle();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelTitle();
            }
          }}
          onBlur={() => saveTitle()}
          aria-label="编辑标题"
          autoFocus
        />
      ) : (
        <h1 className="issue-title">
          <button
            type="button"
            className="issue-title-btn"
            onClick={() => setEditingTitle(true)}
            title="点击编辑标题"
          >
            {issue.title}
          </button>
        </h1>
      )}

      {editingDesc ? (
        <div className="issue-desc-edit">
          <textarea
            className="issue-desc-input"
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelDesc();
              }
            }}
            rows={6}
            aria-label="编辑描述"
            autoFocus
          />
          <div className="issue-desc-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelDesc}
              disabled={update.isPending}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveDesc}
              disabled={update.isPending}
            >
              保存描述
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`issue-desc-btn${issue.description ? '' : ' issue-desc-btn--empty'}`}
          onClick={() => setEditingDesc(true)}
          title="点击编辑描述"
        >
          {issue.description ? (
            <MarkdownBody source={issue.description} />
          ) : (
            <span className="issue-desc-placeholder">添加描述…</span>
          )}
        </button>
      )}

      <div className="issue-meta">
        <label className="issue-priority-field">
          <span>优先级</span>
          <select
            className="priority-select"
            value={issue.priority}
            onChange={(e) =>
              update.mutate({
                id: issue.id,
                input: { priority: e.target.value as Priority },
              })
            }
            aria-label="优先级"
          >
            {ALL_PRIORITY.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_ZH[p]}
              </option>
            ))}
          </select>
          {issue.priority !== 'none' ? (
            <Link
              href={`/?priority=${encodeURIComponent(issue.priority)}`}
              className="issue-priority-board-link"
              data-testid="issue-priority-board-link"
              data-priority={issue.priority}
              title="看板筛选此优先级"
            >
              看板
            </Link>
          ) : null}
        </label>
        <span className="issue-assignee-label">
          指派：
          {issue.assignee?.type === 'agent' ? (
            <Link
              href={`/agents/${issue.assignee.id}`}
              className="issue-assignee-link"
              data-testid="issue-assignee-link"
              data-assignee-type="agent"
              data-assignee-id={issue.assignee.id}
            >
              {issue.assignee.label}
            </Link>
          ) : issue.assignee?.type === 'squad' ? (
            <Link
              href={`/squads/${issue.assignee.id}`}
              className="issue-assignee-link"
              data-testid="issue-assignee-link"
              data-assignee-type="squad"
              data-assignee-id={issue.assignee.id}
            >
              {issue.assignee.label}
            </Link>
          ) : (
            <span data-testid="issue-assignee-none">{issue.assignee?.label ?? '未指派'}</span>
          )}
        </span>
        <AssigneeSelect issueId={issue.id} currentAssignee={issue.assignee} />
        <label className="issue-project-field" data-testid="issue-project-field">
          <span>项目</span>
          <select
            className="priority-select"
            value={issue.projectId ?? ''}
            aria-label="所属项目"
            onChange={(e) => {
              const v = e.target.value;
              update.mutate({
                id: issue.id,
                input: { projectId: v ? v : null },
              });
            }}
          >
            <option value="">无项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {issue.projectId ? (
            <Link
              href={`/projects/${issue.projectId}`}
              className="issue-priority-board-link"
              data-testid="issue-project-link"
              title={issue.projectTitle ?? '打开项目'}
            >
              打开
            </Link>
          ) : null}
        </label>
      </div>
      <IssueLabelsEditor issue={issue} />
    </header>
  );
}
