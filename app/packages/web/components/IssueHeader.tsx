'use client';
import Link from 'next/link';
import type { Issue, IssueStatus, Priority } from '@ma/shared';
import { IssueStatus as IssueStatusEnum, Priority as PriorityEnum } from '@ma/shared';
import { useUpdateIssue } from '@/lib/api';
import { AssigneeSelect } from './AssigneeSelect';
import { IssueLabelsEditor } from './IssueLabelsEditor';
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
      <h1 className="issue-title">{issue.title}</h1>
      {issue.description && (
        <p className="issue-desc">{issue.description}</p>
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
        <AssigneeSelect
          issueId={issue.id}
          currentAssignee={issue.assignee}
        />
      </div>
      <IssueLabelsEditor issue={issue} />
    </header>
  );
}
