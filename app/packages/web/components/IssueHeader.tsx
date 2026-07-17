'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Issue, IssueStatus, Priority } from '@ma/shared';
import { IssueStatus as IssueStatusEnum, Priority as PriorityEnum } from '@ma/shared';
import { useUpdateIssue } from '@/lib/api';
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
      <div className="issue-header-top">
        <Link href="/" className="back-link">
          <Icon name="arrow-left" size={16} />
          看板
        </Link>
        <span className="issue-id">{issue.identifier}</span>
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
        </label>
        <span>指派：{issue.assignee?.label ?? '未指派'}</span>
        <AssigneeSelect issueId={issue.id} currentAssignee={issue.assignee} />
      </div>
      <IssueLabelsEditor issue={issue} />
    </header>
  );
}
