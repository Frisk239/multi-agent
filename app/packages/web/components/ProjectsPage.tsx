'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Project, ProjectStatus } from '@ma/shared';
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

const STATUS_ZH: Record<ProjectStatus, string> = {
  planned: '规划中',
  active: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

const STATUS_OPTIONS: { value: '' | ProjectStatus; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '进行中' },
  { value: 'planned', label: '规划中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

function progressPct(p: Project): number {
  const total = p.issueStats?.total ?? 0;
  const done = p.issueStats?.done ?? 0;
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/**
 * Multica `/projects` 本地精简版：
 * - 列表 / 搜索 / 状态筛选 / 新建 / 行进详情+看板
 * - 不做 lead / pin / grid 双视图 / 多选批量（云端协作能力）
 * - 删除：卸挂 issue 后删容器
 */
export function ProjectsPage() {
  const { data: projects = [], isLoading, isError, error, refetch } = useProjects();
  const create = useCreateProject();
  const update = useUpdateProject();
  const del = useDeleteProject();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusCreate, setStatusCreate] = useState<ProjectStatus>('active');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ProjectStatus>('');

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (!query) return true;
      const hay = `${p.title} ${p.description ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [projects, q, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: projects.length, active: 0, planned: 0, completed: 0, cancelled: 0 };
    for (const p of projects) {
      if (p.status === 'active') c.active += 1;
      else if (p.status === 'planned') c.planned += 1;
      else if (p.status === 'completed') c.completed += 1;
      else if (p.status === 'cancelled') c.cancelled += 1;
    }
    return c;
  }, [projects]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || create.isPending) return;
    await create.mutateAsync({
      title: t,
      description: description.trim() || undefined,
      status: statusCreate,
    });
    setTitle('');
    setDescription('');
    setStatusCreate('active');
    setOpen(false);
  }

  function handleDelete(p: Project) {
    const n = p.issueStats?.total ?? 0;
    const msg =
      n > 0
        ? `删除项目「${p.title}」？其下 ${n} 个 Issue 会脱离项目（Issue 本身保留）。`
        : `删除项目「${p.title}」？`;
    if (!window.confirm(msg)) return;
    del.mutate(p.id);
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
    <div
      className="page-container collection-page projects-page projects-page--multica"
      data-testid="projects-page"
    >
      <div className="page-header">
        <div>
          <Icon name="project" size={16} className="page-header-icon" />
          <h1 className="page-title">
            项目
            <span className="count" data-testid="projects-count">
              {statusFilter || q.trim()
                ? `${visible.length}/${projects.length}`
                : projects.length}
            </span>
          </h1>
          <p className="page-desc page-desc--quiet">
            把相关 issue 归到同一项目下跟踪（本地容器；无 lead / 资源绑定）
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="projects-new-btn"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '取消' : '新建项目'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {open ? (
          <form
            className="ops-form surface-card projects-create-form"
            onSubmit={onSubmit}
            data-testid="projects-create-form"
          >
            <div className="ops-form-grid">
              <label className="ops-field" style={{ gridColumn: '1 / -1' }}>
                <span>名称</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="如：验收项目"
                  data-testid="projects-create-title"
                  required
                  autoFocus
                />
              </label>
              <label className="ops-field">
                <span>状态</span>
                <select
                  value={statusCreate}
                  onChange={(e) => setStatusCreate(e.target.value as ProjectStatus)}
                  data-testid="projects-create-status"
                  aria-label="新建项目状态"
                >
                  {(Object.keys(STATUS_ZH) as ProjectStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_ZH[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="ops-field">
              <span>描述</span>
              <textarea
                className="ops-textarea"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选"
                data-testid="projects-create-desc"
              />
            </label>
            <div className="ops-form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!title.trim() || create.isPending}
                data-testid="projects-create-submit"
              >
                {create.isPending ? '创建中…' : '创建'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setOpen(false);
                  setTitle('');
                  setDescription('');
                }}
              >
                取消
              </button>
            </div>
          </form>
        ) : null}

        {projects.length > 0 ? (
          <div className="agents-filters collection-toolbar" data-testid="projects-filters">
            <div className="table-search memory-search-wrap">
              <input
                type="search"
                placeholder="搜索项目名称 / 描述…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="projects-search"
                aria-label="搜索项目"
              />
            </div>
            <label className="agents-filter-field">
              状态
              <select
                value={statusFilter}
                data-testid="projects-status-filter"
                onChange={(e) => setStatusFilter(e.target.value as '' | ProjectStatus)}
                aria-label="按状态筛选"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                    {o.value === ''
                      ? ` · ${counts.all}`
                      : o.value === 'active'
                        ? ` · ${counts.active}`
                        : o.value === 'planned'
                          ? ` · ${counts.planned}`
                          : o.value === 'completed'
                            ? ` · ${counts.completed}`
                            : ` · ${counts.cancelled}`}
                  </option>
                ))}
              </select>
            </label>
            {q.trim() || statusFilter ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                data-testid="projects-filters-clear"
                onClick={() => {
                  setQ('');
                  setStatusFilter('');
                }}
              >
                清除筛选
              </button>
            ) : null}
          </div>
        ) : null}

        {projects.length === 0 ? (
          <EmptyState
            title="还没有项目"
            description="创建第一个项目，把相关 Issue 归拢到一起。"
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="projects-empty-create"
                onClick={() => setOpen(true)}
              >
                创建第一个项目
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="没有匹配的项目"
            description="试试清除筛选或换个关键词。"
            action={
              <button
                type="button"
                className="btn-secondary btn-sm"
                data-testid="projects-empty-clear"
                onClick={() => {
                  setQ('');
                  setStatusFilter('');
                }}
              >
                清除筛选
              </button>
            }
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table" data-testid="projects-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>本机目录</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>更新</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const total = p.issueStats?.total ?? 0;
                  const done = p.issueStats?.done ?? 0;
                  const pct = progressPct(p);
                  return (
                    <tr key={p.id} data-testid="projects-row" data-project-id={p.id}>
                      <td>
                        <Link href={`/projects/${p.id}`} className="agent-cell">
                          <span className="agent-icon-sm">
                            <Icon name="project" size={14} />
                          </span>
                          <span>
                            <div className="agent-cell-name">{p.title}</div>
                            {p.description ? (
                              <div className="text-dim text-sm projects-row-desc">
                                {p.description}
                              </div>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td data-testid="projects-row-path">
                        {p.localPath ? (
                          <span
                            className={`project-path-badge${
                              p.localPathExists ? ' is-ok' : ' is-bad'
                            }`}
                            title={p.localPath}
                          >
                            {p.localPathExists ? '已绑定' : '路径无效'}
                          </span>
                        ) : (
                          <span className="text-dim text-sm">未绑定</span>
                        )}
                      </td>
                      <td>
                        <select
                          className="projects-inline-status"
                          value={p.status}
                          aria-label={`${p.title} 状态`}
                          data-testid="projects-row-status"
                          onChange={(e) =>
                            update.mutate({
                              id: p.id,
                              input: { status: e.target.value as ProjectStatus },
                            })
                          }
                        >
                          {(Object.keys(STATUS_ZH) as ProjectStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_ZH[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-testid="projects-row-stats">
                        <div className="projects-progress" title={`${done}/${total} 完成`}>
                          <div className="projects-progress-track" aria-hidden>
                            <div
                              className="projects-progress-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="projects-progress-label text-dim text-sm">
                            {total > 0 ? `${done}/${total}` : '无 issue'}
                          </span>
                        </div>
                      </td>
                      <td className="text-dim text-sm">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/projects/${p.id}`}
                          className="btn btn-ghost btn-sm"
                          data-testid="projects-row-open"
                        >
                          打开
                        </Link>{' '}
                        <Link
                          href={`/?project=${encodeURIComponent(p.id)}`}
                          className="btn btn-ghost btn-sm"
                          data-testid="projects-row-board"
                          title="看板筛选此项目"
                        >
                          看板
                        </Link>{' '}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid="projects-row-delete"
                          disabled={del.isPending}
                          onClick={() => handleDelete(p)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
