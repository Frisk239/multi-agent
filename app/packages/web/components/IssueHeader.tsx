'use client';
import Link from 'next/link';
import type { Issue, IssueStatus } from '@ma/shared';
import { IssueStatus as IssueStatusEnum } from '@ma/shared';
import { useUpdateIssue } from '@/lib/api';
import { AssigneeSelect } from './AssigneeSelect';

const ALL_STATUS = IssueStatusEnum.options;

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

export function IssueHeader({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();

  return (
    <header className="issue-header">
      <div className="issue-header-top">
        <Link href="/">← 看板</Link>
        <span className="issue-id">{issue.identifier}</span>
        <select
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
      <h1 className="issue-title">{issue.title}</h1>
      {issue.description && (
        <p className="issue-desc">{issue.description}</p>
      )}
      <div className="issue-meta">
        <span>优先级：{issue.priority}</span>
        <span>
          指派：{issue.assignee?.label ?? '未指派'}
        </span>
        <AssigneeSelect
          issueId={issue.id}
          currentAgentId={
            issue.assignee?.type === 'agent' ? issue.assignee.id : null
          }
        />
      </div>
    </header>
  );
}
