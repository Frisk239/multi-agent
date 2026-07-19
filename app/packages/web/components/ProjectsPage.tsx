'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import type { Project } from '@ma/shared';
import { useCreateProject, useProjects } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

const STATUS_ZH: Record<Project['status'], string> = {
  planned: '规划中',
  active: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

export function ProjectsPage() {
  const { data: projects = [], isLoading, isError, error, refetch } = useProjects();
  const create = useCreateProject();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || create.isPending) return;
    await create.mutateAsync({
      title: t,
      description: description.trim() || undefined,
      status: 'active',
    });
    setTitle('');
    setDescription('');
    setOpen(false);
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <EmptyState title="加载项目…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-container">
        <EmptyState
          title="无法加载项目"
          description={error instanceof Error ? error.message : '请确认 API 已启动'}
          action={
            <button type="button" className="btn-ghost btn-sm" onClick={() => void refetch()}>
              重试
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container projects-page" data-testid="projects-page">
      <header className="collection-header">
        <div>
          <h1 className="collection-title">
            <Icon name="project" size={20} />
            项目
          </h1>
          <p className="collection-desc">跨 issue 的产品容器；把相关工作归到同一项目下。</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="projects-new-btn"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '取消' : '新建项目'}
        </button>
      </header>

      {open ? (
        <form className="projects-create-form" onSubmit={onSubmit} data-testid="projects-create-form">
          <input
            className="projects-create-title"
            placeholder="项目名称"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="projects-create-title"
            autoFocus
          />
          <textarea
            className="projects-create-desc"
            placeholder="描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={!title.trim() || create.isPending}
            data-testid="projects-create-submit"
          >
            {create.isPending ? '创建中…' : '创建'}
          </button>
        </form>
      ) : null}

      {projects.length === 0 ? (
        <EmptyState
          title="还没有项目"
          description="创建第一个项目，把相关 Issue 归拢到一起。"
          action={
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="projects-empty-create"
              onClick={() => setOpen(true)}
            >
              创建第一个项目
            </button>
          }
        />
      ) : (
        <ul className="projects-list" data-testid="projects-list">
          {projects.map((p) => (
            <li key={p.id} className="projects-row" data-testid="projects-row" data-project-id={p.id}>
              <Link href={`/projects/${p.id}`} className="projects-row-main">
                <span className="projects-row-title">{p.title}</span>
                <span className="projects-row-status" data-status={p.status}>
                  {STATUS_ZH[p.status]}
                </span>
              </Link>
              <span className="projects-row-stats" data-testid="projects-row-stats">
                {p.issueStats
                  ? `${p.issueStats.done}/${p.issueStats.total} 完成`
                  : '0 个 issue'}
              </span>
              <Link
                href={`/?project=${encodeURIComponent(p.id)}`}
                className="projects-row-board"
                title="看板筛选此项目"
              >
                看板
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
