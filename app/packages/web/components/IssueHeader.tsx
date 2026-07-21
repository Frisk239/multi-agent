'use client';
import { useEffect, useState, type ReactNode } from 'react';
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
import { PageBreadcrumb } from './PageBreadcrumb';

const ALL_STATUS = IssueStatusEnum.options;
const ALL_PRIORITY = PriorityEnum.options;

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

const PRIORITY_ZH: Record<Priority, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
  none: '无',
};

type IssueHeaderVariant = 'full' | 'main' | 'props';

export function IssueHeader({
  issue,
  variant = 'full',
  endActions,
}: {
  issue: Issue;
  /** full=旧单列；main=标题描述；props=右栏属性（G26） */
  variant?: IssueHeaderVariant;
  /** 主列顶栏右侧附加（如属性开关） */
  endActions?: ReactNode;
}) {
  const update = useUpdateIssue();
  const { data: projects = [] } = useProjects();
  const { data: subscription } = useIssueSubscription(issue.id);
  const toggleSub = useToggleIssueSubscription(issue.id);
  const subscribed = subscription?.subscribed ?? false;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(issue.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(issue.description ?? '');

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

  const showMain = variant === 'full' || variant === 'main';
  const showProps = variant === 'full' || variant === 'props';
  const propsRail = variant === 'props';

  const propsBlock = (
    <div
      className={`issue-meta${propsRail ? ' issue-meta--rail' : ' issue-meta--compact'}`}
      data-testid="issue-meta"
    >
      <label className="issue-priority-field">
        <span className="issue-meta-k">状态</span>
        <select
          className="status-select"
          value={issue.status}
          onChange={(e) =>
            update.mutate({ id: issue.id, input: { status: e.target.value as IssueStatus } })
          }
          aria-label="状态"
          data-testid="issue-props-status"
        >
          {ALL_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_ZH[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="issue-priority-field">
        <span className="issue-meta-k">优先级</span>
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
      </label>
      <div className="issue-meta-assignee" data-testid="issue-meta-assignee">
        <span className="issue-meta-k">负责人</span>
        <AssigneeSelect issueId={issue.id} currentAssignee={issue.assignee} />
      </div>
      <label className="issue-project-field" data-testid="issue-project-field">
        <span className="issue-meta-k">项目</span>
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
      </label>
      {issue.parentIssueId ? (
        <div className="issue-props-parent" data-testid="issue-props-parent">
          <span className="issue-meta-k">父 issue</span>
          <Link href={`/issues/${issue.parentIssueId}`} className="table-link">
            {issue.parentIdentifier ?? issue.parentIssueId.slice(0, 8)}
          </Link>
        </div>
      ) : null}
      <IssuePrLinkField issue={issue} />
      <IssueLabelsEditor issue={issue} />
    </div>
  );

  if (variant === 'props') {
    return (
      <div className="issue-header issue-header--props" data-testid="issue-header-props">
        {propsBlock}
      </div>
    );
  }

  return (
    <header className={`issue-header${variant === 'main' ? ' issue-header--main' : ''}`}>
      <div className="issue-header-top">
        <div className="issue-header-top-start">
          <PageBreadcrumb
            testId="issue-breadcrumb"
            items={
              issue.parentIssueId
                ? [
                    { label: '运行', href: '/runs' },
                    {
                      label: issue.parentIdentifier ?? '父 issue',
                      href: `/issues/${issue.parentIssueId}`,
                    },
                    { label: issue.identifier },
                  ]
                : [
                    { label: '运行', href: '/runs' },
                    { label: issue.identifier },
                  ]
            }
          />
          {issue.originType === 'automation' ? (
            <span className="issue-origin-badge-group" data-testid="issue-origin-badge-group">
              <Link
                href="/?origin=automation"
                className="issue-origin-badge"
                data-testid="issue-origin-badge"
                data-origin="automation"
                title="看板筛选：自动化 Issue"
              >
                自动化
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
                快速派活
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
        </div>
        <div className="issue-header-top-end">
          <button
            type="button"
            className={`btn btn-ghost btn-sm issue-subscribe-btn${
              subscribed ? ' issue-subscribe-btn--on' : ''
            }`}
            data-testid="issue-subscribe-btn"
            data-subscribed={subscribed ? '1' : '0'}
            disabled={toggleSub.isPending || subscription == null}
            title={
              subscribed
                ? `已关注${subscription?.reason ? `（${subscription.reason}）` : ''} · 点击取消`
                : '关注后接收此 Issue 相关收件箱通知'
            }
            onClick={() => toggleSub.mutate(subscribed)}
          >
            {subscribed ? '已关注' : '关注'}
          </button>
          {endActions}
          {variant === 'main' ? null : (
            <span className="issue-status-field">
              <select
                className="status-select"
                value={issue.status}
                onChange={(e) =>
                  update.mutate({
                    id: issue.id,
                    input: { status: e.target.value as IssueStatus },
                  })
                }
                aria-label="状态"
              >
                {ALL_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_ZH[s]}
                  </option>
                ))}
              </select>
            </span>
          )}
        </div>
      </div>

      {showMain && editingTitle ? (
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
      ) : showMain ? (
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
      ) : null}

      {showMain && editingDesc ? (
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
      ) : showMain ? (
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
      ) : null}

      {showProps ? propsBlock : null}
    </header>
  );
}

function IssuePrLinkField({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(issue.prUrl ?? '');

  useEffect(() => {
    if (!editing) setDraft(issue.prUrl ?? '');
  }, [issue.prUrl, editing]);

  function save() {
    const next = draft.trim();
    const prev = (issue.prUrl ?? '').trim();
    if (next === prev) {
      setEditing(false);
      return;
    }
    if (next && !/^https?:\/\//i.test(next)) {
      // 与 API 校验一致：让用户改完再存
      return;
    }
    update.mutate(
      { id: issue.id, input: { prUrl: next ? next : null } },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <label className="issue-pr-field" data-testid="issue-pr-field">
        <span>PR</span>
        <input
          className="issue-pr-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://github.com/.../pull/1"
          aria-label="Pull Request URL"
          data-testid="issue-pr-input"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(issue.prUrl ?? '');
              setEditing(false);
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary btn-sm"
          data-testid="issue-pr-save"
          disabled={update.isPending}
          onClick={save}
        >
          保存
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setDraft(issue.prUrl ?? '');
            setEditing(false);
          }}
        >
          取消
        </button>
      </label>
    );
  }

  return (
    <div className="issue-pr-field" data-testid="issue-pr-field">
      <span>PR</span>
      {issue.prUrl ? (
        <>
          <a
            href={issue.prUrl}
            className="issue-pr-link"
            target="_blank"
            rel="noreferrer"
            data-testid="issue-pr-link"
            title={issue.prUrl}
          >
            {shortPrLabel(issue.prUrl)}
          </a>
          <button
            type="button"
            className="btn-ghost btn-sm"
            data-testid="issue-pr-edit"
            onClick={() => setEditing(true)}
          >
            编辑
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn-ghost btn-sm"
          data-testid="issue-pr-add"
          onClick={() => setEditing(true)}
        >
          添加链接
        </button>
      )}
    </div>
  );
}

function shortPrLabel(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const prIdx = parts.findIndex((p) => p === 'pull' || p === 'pulls' || p === 'merge_requests');
    if (prIdx >= 0 && parts[prIdx + 1]) {
      const repo = parts.slice(0, prIdx).slice(-2).join('/');
      return `${repo || u.hostname}#${parts[prIdx + 1]}`;
    }
    return u.hostname + u.pathname.replace(/\/$/, '');
  } catch {
    return url.length > 40 ? `${url.slice(0, 37)}…` : url;
  }
}
