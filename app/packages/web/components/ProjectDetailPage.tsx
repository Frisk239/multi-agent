'use client';

import Link from 'next/link';
import type { ProjectStatus } from '@ma/shared';
import { ProjectStatus as ProjectStatusEnum } from '@ma/shared';
import { useCreateIssue, useIssues, useProject, useUpdateProject } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { FormEvent, useState } from 'react';

const STATUS_ZH: Record<ProjectStatus, string> = {
  planned: '规划中',
  active: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

const ISSUE_STATUS_ZH: Record<string, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

export function ProjectDetailPage({ id }: { id: string }) {
  const { data: project, isLoading, isError, error, refetch } = useProject(id);
  const { data: issues = [], isLoading: issuesLoading } = useIssues({ projectId: id });
  const update = useUpdateProject();
  const createIssue = useCreateIssue();
  const [issueTitle, setIssueTitle] = useState('');

  async function onAddIssue(e: FormEvent) {
    e.preventDefault();
    const t = issueTitle.trim();
    if (!t || createIssue.isPending) return;
    await createIssue.mutateAsync({
      title: t,
      projectId: id,
      priority: 'none',
      assignee: null,
    });
    setIssueTitle('');
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <EmptyState title="加载项目…" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="page-container">
        <EmptyState
          title="项目不存在"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Link href="/projects" className="btn-ghost btn-sm">
              返回项目列表
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container project-detail" data-testid="project-detail">
      <div className="project-detail-top">
        <Link href="/projects" className="back-link">
          <Icon name="arrow-left" size={16} />
          项目
        </Link>
        <select
          className="status-select"
          value={project.status}
          aria-label="项目状态"
          onChange={(e) =>
            update.mutate({
              id: project.id,
              input: { status: e.target.value as ProjectStatus },
            })
          }
        >
          {ProjectStatusEnum.options.map((s) => (
            <option key={s} value={s}>
              {STATUS_ZH[s]}
            </option>
          ))}
        </select>
      </div>

      <h1 className="collection-title">{project.title}</h1>
      {project.description ? (
        <p className="project-detail-desc">{project.description}</p>
      ) : (
        <p className="project-detail-desc muted">暂无描述</p>
      )}

      <div className="project-detail-meta">
        <span data-testid="project-issue-stats">
          Issue {project.issueStats?.done ?? 0}/{project.issueStats?.total ?? 0} 完成
        </span>
        <Link href={`/?project=${encodeURIComponent(project.id)}`} className="projects-row-board">
          在看板查看
        </Link>
      </div>

      <section className="project-issues" data-testid="project-issues">
        <h2 className="project-issues-title">项目 Issue</h2>
        {issuesLoading ? (
          <p className="muted">加载中…</p>
        ) : issues.length === 0 ? (
          <p className="muted" data-testid="project-issues-empty">
            还没有 Issue。在下方添加，或到看板把现有卡挂到此项目。
          </p>
        ) : (
          <ul className="project-issues-list">
            {issues.map((iss) => (
              <li key={iss.id} className="project-issues-row" data-testid="project-issues-row">
                <Link href={`/issues/${iss.id}`} className="issue-subtasks-id">
                  {iss.identifier}
                </Link>
                <Link href={`/issues/${iss.id}`} className="issue-subtasks-row-title">
                  {iss.title}
                </Link>
                <span className="project-issues-status">
                  {ISSUE_STATUS_ZH[iss.status] ?? iss.status}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form className="project-issues-form" onSubmit={onAddIssue} data-testid="project-add-issue">
          <input
            className="issue-subtasks-input"
            placeholder="在此项目新建 Issue…"
            value={issueTitle}
            onChange={(e) => setIssueTitle(e.target.value)}
            data-testid="project-add-issue-input"
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={!issueTitle.trim() || createIssue.isPending}
            data-testid="project-add-issue-submit"
          >
            添加
          </button>
        </form>
      </section>
    </div>
  );
}
