'use client';

import Link from 'next/link';
import type { ProjectStatus } from '@ma/shared';
import { ProjectStatus as ProjectStatusEnum } from '@ma/shared';
import {
  useCreateIssue,
  useDeleteProject,
  useIssues,
  useProject,
  useUpdateProject,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const { data: project, isLoading, isError, error, refetch } = useProject(id);
  const { data: issues = [], isLoading: issuesLoading } = useIssues({ projectId: id });
  const update = useUpdateProject();
  const del = useDeleteProject();
  const createIssue = useCreateIssue();
  const [issueTitle, setIssueTitle] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);

  useEffect(() => {
    if (!project) return;
    if (!editingTitle) setTitleDraft(project.title);
    if (!editingDesc) setDescDraft(project.description ?? '');
  }, [project, editingTitle, editingDesc]);

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

  function saveTitle() {
    if (!project) return;
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(project.title);
      setEditingTitle(false);
      return;
    }
    if (next === project.title) {
      setEditingTitle(false);
      return;
    }
    update.mutate(
      { id: project.id, input: { title: next } },
      { onSuccess: () => setEditingTitle(false) },
    );
  }

  function saveDesc() {
    if (!project) return;
    const next = descDraft.trim() === '' ? null : descDraft;
    const prev = project.description ?? null;
    if (next === prev) {
      setEditingDesc(false);
      return;
    }
    update.mutate(
      { id: project.id, input: { description: next } },
      { onSuccess: () => setEditingDesc(false) },
    );
  }

  function handleDelete() {
    if (!project) return;
    const n = project.issueStats?.total ?? issues.length;
    const msg =
      n > 0
        ? `删除项目「${project.title}」？其下 ${n} 个 Issue 会脱离项目（Issue 本身保留）。`
        : `删除项目「${project.title}」？`;
    if (!window.confirm(msg)) return;
    del.mutate(project.id, {
      onSuccess: () => router.push('/projects'),
    });
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

  const total = project.issueStats?.total ?? issues.length;
  const done = project.issueStats?.done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="page-container collection-page project-detail project-detail--multica"
      data-testid="project-detail"
    >
      <div className="page-header">
        <div>
          <div className="project-detail-crumb">
            <Link href="/projects" className="back-link">
              <Icon name="arrow-left" size={16} />
              项目
            </Link>
          </div>
          {editingTitle ? (
            <input
              className="project-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => saveTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveTitle();
                }
                if (e.key === 'Escape') {
                  setTitleDraft(project.title);
                  setEditingTitle(false);
                }
              }}
              data-testid="project-title-input"
              autoFocus
            />
          ) : (
            <h1 className="page-title">
              <button
                type="button"
                className="project-title-btn"
                data-testid="project-title"
                onClick={() => setEditingTitle(true)}
                title="点击编辑标题"
              >
                {project.title}
              </button>
            </h1>
          )}
          <p className="page-desc page-desc--quiet">
            {done}/{total} 完成
            {total > 0 ? ` · ${pct}%` : ''}
          </p>
        </div>
        <div className="page-actions">
          <select
            className="projects-inline-status"
            value={project.status}
            aria-label="项目状态"
            data-testid="project-status"
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
          <Link
            href={`/?project=${encodeURIComponent(project.id)}`}
            className="btn btn-secondary btn-sm"
            data-testid="project-board-link"
          >
            看板
          </Link>
          <PageHeaderMore testId="project-header-more">
            <button
              type="button"
              role="menuitem"
              onClick={() => void refetch()}
            >
              刷新
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="project-delete"
              disabled={del.isPending}
              onClick={handleDelete}
            >
              删除
            </button>
          </PageHeaderMore>
        </div>
      </div>

      <div className="page-body project-detail-body">
        <section className="settings-card project-detail-about" data-testid="project-about">
          <div className="settings-section-head">
            <h2 className="settings-section-title" style={{ fontSize: '0.95rem' }}>
              描述
            </h2>
          </div>
          {editingDesc ? (
            <div>
              <textarea
                className="ops-textarea"
                rows={4}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                data-testid="project-desc-input"
                autoFocus
              />
              <div className="ops-form-actions" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveDesc}>
                  保存
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setDescDraft(project.description ?? '');
                    setEditingDesc(false);
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`project-desc-btn${project.description ? '' : ' is-empty'}`}
              data-testid="project-desc"
              onClick={() => setEditingDesc(true)}
            >
              {project.description || '添加描述…'}
            </button>
          )}

          <div className="projects-progress projects-progress--detail" data-testid="project-issue-stats">
            <div className="projects-progress-track" aria-hidden>
              <div className="projects-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-dim text-sm">
              Issue {done}/{total} 完成
            </span>
          </div>
        </section>

        <section className="settings-card project-issues" data-testid="project-issues">
          <div className="project-issues-head">
            <h2 className="settings-section-title" style={{ fontSize: '0.95rem', margin: 0 }}>
              项目 Issue
            </h2>
            <span className="text-dim text-sm">{issues.length}</span>
          </div>

          {issuesLoading ? (
            <p className="text-dim text-sm">加载中…</p>
          ) : issues.length === 0 ? (
            <p className="text-dim text-sm" data-testid="project-issues-empty">
              还没有 Issue。在下方添加，或到看板把现有卡挂到此项目。
            </p>
          ) : (
            <div className="data-table-wrap" style={{ border: 0, boxShadow: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((iss) => (
                    <tr key={iss.id} data-testid="project-issues-row">
                      <td>
                        <Link href={`/issues/${iss.id}`} className="agent-cell">
                          <span className="text-dim text-sm">{iss.identifier}</span>
                          <span className="agent-cell-name">{iss.title}</span>
                        </Link>
                      </td>
                      <td>
                        <code className={`run-pill run-pill--${iss.status}`}>
                          {ISSUE_STATUS_ZH[iss.status] ?? iss.status}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            className="project-issues-form"
            onSubmit={onAddIssue}
            data-testid="project-add-issue"
          >
            <input
              className="input"
              placeholder="在此项目新建 Issue…"
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              data-testid="project-add-issue-input"
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!issueTitle.trim() || createIssue.isPending}
              data-testid="project-add-issue-submit"
            >
              {createIssue.isPending ? '创建中…' : '添加'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
