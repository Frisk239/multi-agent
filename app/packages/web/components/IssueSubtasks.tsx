'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import type { Issue, IssueStatus } from '@ma/shared';
import { useCreateIssue, useIssueChildren } from '@/lib/api';

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

function isDoneStatus(s: IssueStatus) {
  return s === 'done' || s === 'cancelled';
}

export function IssueSubtasks({ parent }: { parent: Issue }) {
  // 子 issue 不再嵌套子级（与 API 一致）
  const isChild = Boolean(parent.parentIssueId);
  const { data: children = [], isLoading } = useIssueChildren(parent.id);
  const create = useCreateIssue();
  const [title, setTitle] = useState('');

  if (isChild) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || create.isPending) return;
    await create.mutateAsync({
      title: t,
      parentIssueId: parent.id,
      priority: 'none',
      assignee: null,
    });
    setTitle('');
  }

  const total = children.length;
  const done = children.filter((c) => isDoneStatus(c.status)).length;
  const progressLabel =
    total > 0
      ? `${done}/${total}`
      : parent.childProgress && parent.childProgress.total > 0
        ? `${parent.childProgress.done}/${parent.childProgress.total}`
        : null;

  return (
    <section className="issue-subtasks" data-testid="issue-subtasks">
      <div className="issue-subtasks-head">
        <h3 className="issue-subtasks-title">子 issue</h3>
        {progressLabel ? (
          <span className="issue-subtasks-progress" data-testid="issue-subtasks-progress">
            {progressLabel} 完成
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="issue-subtasks-empty">加载中…</p>
      ) : children.length === 0 ? (
        <p className="issue-subtasks-empty" data-testid="issue-subtasks-empty">
          还没有子 issue。把大任务拆成可独立指派的小项。
        </p>
      ) : (
        <ul className="issue-subtasks-list" data-testid="issue-subtasks-list">
          {children.map((c) => (
            <SubtaskRow key={c.id} issue={c} />
          ))}
        </ul>
      )}

      <form className="issue-subtasks-form" onSubmit={onSubmit} data-testid="issue-subtasks-form">
        <input
          type="text"
          className="issue-subtasks-input"
          placeholder="添加子 issue…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={create.isPending}
          data-testid="issue-subtasks-input"
          aria-label="子 issue 标题"
        />
        <button
          type="submit"
          className="btn btn-secondary issue-subtasks-add"
          disabled={!title.trim() || create.isPending}
          data-testid="issue-subtasks-add"
        >
          {create.isPending ? '添加中…' : '添加'}
        </button>
      </form>
    </section>
  );
}

function SubtaskRow({ issue }: { issue: Issue }) {
  return (
    <li
      className={[
        'issue-subtasks-row',
        isDoneStatus(issue.status) ? 'issue-subtasks-row--done' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="issue-subtasks-row"
      data-issue-id={issue.id}
    >
      <span
        className="issue-subtasks-status"
        data-status={issue.status}
        title={STATUS_ZH[issue.status]}
      />
      <Link href={`/issues/${issue.id}`} className="issue-subtasks-id">
        {issue.identifier}
      </Link>
      <Link href={`/issues/${issue.id}`} className="issue-subtasks-row-title">
        {issue.title}
      </Link>
      {issue.assignee ? (
        <span className="issue-subtasks-assignee" title={issue.assignee.label}>
          {issue.assignee.label}
        </span>
      ) : null}
    </li>
  );
}
