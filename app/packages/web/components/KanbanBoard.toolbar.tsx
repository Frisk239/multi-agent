'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentSummary, SquadSummary, IssueLabel, Project } from '@ma/shared';
import { Select } from './Select';
import { NewIssueForm, type NewIssueQuickCreate } from './NewIssueForm';
import { EmptyState } from './EmptyState';
import type { Density } from '@/lib/density';
import { PRIORITY_OPTIONS, COLUMNS } from './KanbanBoard.shared';

/**
 * O4 拆分：看板工具栏（视图/范围/搜索/筛选/导入导出/活动筛选 chips/空状态）。
 * 原 KanbanBoard.tsx 932-1421 行 JSX 搬移；props = 主组件 state + handlers 显式传入
 * （KanbanBoard 对外导出 props 契约不变）。
 */
export interface KanbanToolbarProps {
  // 范围 / 指派
  selectValue: string;
  setAssigneeFilter: (v: string) => void;
  agents: AgentSummary[];
  squads: SquadSummary[];
  // 搜索
  qDraft: string;
  setQDraft: (v: string) => void;
  qFromUrl: string;
  searchParams: URLSearchParams;
  // 视图 / 排序
  viewMode: 'board' | 'list';
  setViewMode: (v: 'board' | 'list') => void;
  sortMode: 'manual' | 'updated';
  setSortMode: (v: 'manual' | 'updated') => void;
  // 快捷创建
  quickCreate: NewIssueQuickCreate | null;
  // 更多筛选
  showMore: boolean;
  setMoreFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  moreFilterCount: number;
  density: Density;
  setDensity: (d: Density) => void;
  priorityQuery: string | null | undefined;
  setPriorityFilter: (v: string) => void;
  originQuery: string | null | undefined;
  setOriginFilter: (v: string) => void;
  projectFromUrl: string;
  assigneeFromUrl: string;
  setProjectFilter: (v: string) => void;
  projects: Project[];
  statusQuery: string | null | undefined;
  setStatusFilter: (v: string) => void;
  failedOnly: boolean;
  setFailedOnly: (v: boolean) => void;
  failedCount: number;
  visibleCount: number;
  labelFilter: string;
  setLabelFilter: (v: string) => void;
  labels: IssueLabel[] | undefined;
  // 导入导出
  importFileRef: React.RefObject<HTMLInputElement>;
  handleImportFile: (f: File) => void;
  handleExportJson: () => void;
  jsonNotice: string | null;
  // 活动筛选 chips
  assigneeChipLabel: string;
  labelChipName: string;
  priorityChip: string;
  statusChipLabel: string;
  projectChipName: string;
  hasActiveFilters: boolean;
  router: ReturnType<typeof useRouter>;
  pathname: string;
}

export function KanbanToolbar(props: KanbanToolbarProps) {
  const {
    selectValue, setAssigneeFilter, agents, squads,
    qDraft, setQDraft, qFromUrl, searchParams,
    viewMode, setViewMode, sortMode, setSortMode,
    quickCreate, showMore, setMoreFiltersOpen, moreFilterCount,
    density, setDensity, priorityQuery, setPriorityFilter,
    originQuery, setOriginFilter, projectFromUrl, assigneeFromUrl, setProjectFilter, projects,
    statusQuery, setStatusFilter, failedOnly, setFailedOnly, failedCount, visibleCount,
    labelFilter, setLabelFilter, labels,
    importFileRef, handleImportFile, handleExportJson, jsonNotice,
    assigneeChipLabel, labelChipName, priorityChip, statusChipLabel, projectChipName,
    hasActiveFilters, router, pathname,
  } = props;

  return (
    <>
      <div className="kanban-toolbar" data-testid="kanban-toolbar">
        <div className="kanban-toolbar-primary">
          <Suspense fallback={<button type="button" className="btn-new-issue" disabled>新建 Issue</button>}>
            <NewIssueForm quickCreate={quickCreate} />
          </Suspense>
          <div className="kanban-scope-tabs" role="tablist" aria-label="范围" data-testid="kanban-scope-tabs">
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${selectValue === '' ? ' is-active' : ''}`}
              aria-selected={selectValue === ''}
              onClick={() => setAssigneeFilter('')}
            >
              全部
            </button>
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${selectValue === 'any' ? ' is-active' : ''}`}
              aria-selected={selectValue === 'any'}
              onClick={() => setAssigneeFilter('any')}
            >
              已指派
            </button>
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${selectValue.startsWith('agent:') ? ' is-active' : ''}`}
              aria-selected={selectValue.startsWith('agent:')}
              onClick={() => {
                if (!selectValue.startsWith('agent:') && agents[0]) {
                  setAssigneeFilter(`agent:${agents[0].id}`);
                }
              }}
              title="再从下拉选具体智能体"
            >
              智能体
            </button>
          </div>
          <input
            className="kanban-search-input"
            type="search"
            placeholder="搜索标题 / FRI-…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            aria-label="搜索 Issue"
          />
          <Select
            className="kanban-assignee-select"
            value={selectValue}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="按指派筛选"
            data-testid="kanban-assignee-filter"
          >
            <option value="">全部指派</option>
            <option value="any">已指派</option>
            <option value="none">未指派</option>
            <optgroup label="智能体">
              {agents.map((a) => (
                <option key={a.id} value={`agent:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="小队">
              {squads.map((s) => (
                <option key={s.id} value={`squad:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </Select>
          <div
            className="kanban-view-tabs"
            role="tablist"
            aria-label="视图"
            data-testid="kanban-view-tabs"
          >
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${viewMode === 'board' ? ' is-active' : ''}`}
              aria-selected={viewMode === 'board'}
              data-testid="kanban-view-board"
              onClick={() => setViewMode('board')}
            >
              看板
            </button>
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${viewMode === 'list' ? ' is-active' : ''}`}
              aria-selected={viewMode === 'list'}
              data-testid="kanban-view-list"
              onClick={() => setViewMode('list')}
            >
              列表
            </button>
          </div>
          {viewMode === 'list' ? (
            <div
              className="kanban-sort-tabs"
              role="tablist"
              aria-label="列表排序"
              data-testid="kanban-sort-tabs"
            >
              <button
                type="button"
                role="tab"
                className={`kanban-scope-tab${sortMode === 'manual' ? ' is-active' : ''}`}
                aria-selected={sortMode === 'manual'}
                data-testid="kanban-sort-manual"
                onClick={() => setSortMode('manual')}
              >
                手动序
              </button>
              <button
                type="button"
                role="tab"
                className={`kanban-scope-tab${sortMode === 'updated' ? ' is-active' : ''}`}
                aria-selected={sortMode === 'updated'}
                data-testid="kanban-sort-updated"
                onClick={() => setSortMode('updated')}
              >
                最近更新
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={`kanban-more-toggle${showMore ? ' is-open' : ''}${moreFilterCount ? ' has-active' : ''}`}
            data-testid="kanban-more-filters"
            aria-expanded={showMore}
            onClick={() => setMoreFiltersOpen((v) => !v)}
          >
            筛选{moreFilterCount > 0 ? ` · ${moreFilterCount}` : ''}
          </button>
          {/* G5-7：看板快照 JSON 导出/导入 */}
          <button
            type="button"
            className="btn-ghost btn-sm"
            data-testid="kanban-export-json"
            onClick={() => void handleExportJson()}
          >
            导出 JSON
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            data-testid="kanban-import-json"
            onClick={() => importFileRef.current?.click()}
          >
            导入 JSON
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="kanban-import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = '';
            }}
          />
          {jsonNotice ? (
            <span className="text-dim text-sm" data-testid="kanban-json-notice">
              {jsonNotice}
            </span>
          ) : null}
        </div>

        {showMore ? (
          <div className="kanban-toolbar-more" data-testid="kanban-toolbar-more">
            <div className="kanban-density-tabs" role="tablist" aria-label="密度">
              <button
                type="button"
                role="tab"
                className={`kanban-scope-tab${density === 'compact' ? ' is-active' : ''}`}
                aria-selected={density === 'compact'}
                onClick={() => setDensity('compact')}
              >
                紧凑
              </button>
              <button
                type="button"
                role="tab"
                className={`kanban-scope-tab${density === 'default' ? ' is-active' : ''}`}
                aria-selected={density === 'default'}
                onClick={() => setDensity('default')}
              >
                默认
              </button>
              <button
                type="button"
                role="tab"
                className={`kanban-scope-tab${density === 'comfortable' ? ' is-active' : ''}`}
                aria-selected={density === 'comfortable'}
                onClick={() => setDensity('comfortable')}
              >
                舒适
              </button>
            </div>
            <Select
              className="kanban-priority-select"
              value={priorityQuery ?? ''}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="按优先级筛选"
              data-testid="kanban-priority-filter"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <div className="kanban-priority-pills" role="toolbar" aria-label="快捷优先级" data-testid="kanban-priority-pills">
              {(
                [
                  { value: 'urgent', label: '紧急' },
                  { value: 'high', label: '高' },
                  { value: 'medium', label: '中' },
                ] as const
              ).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`kanban-filter-pill${priorityQuery === p.value ? ' active' : ''}`}
                  data-testid={`kanban-priority-pill-${p.value}`}
                  aria-pressed={priorityQuery === p.value}
                  onClick={() =>
                    setPriorityFilter(priorityQuery === p.value ? '' : p.value)
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Select
              className="kanban-origin-select"
              value={originQuery ?? ''}
              onChange={(e) => setOriginFilter(e.target.value)}
              aria-label="按来源筛选"
              data-testid="kanban-origin-filter"
            >
              <option value="">全部来源</option>
              <option value="automation">自动化</option>
              <option value="quick_create">快速派活</option>
            </Select>
            <Select
              className="kanban-project-select"
              value={projectFromUrl}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="按项目筛选"
              data-testid="kanban-project-filter"
            >
              <option value="">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
            <Select
              className="kanban-status-select"
              value={statusQuery ?? ''}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="按状态聚焦列"
              data-testid="kanban-status-filter"
            >
              <option value="">全部列</option>
              {COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>
                  {c.title}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className={`kanban-filter-pill kanban-failed-toggle${failedOnly ? ' active' : ''}`}
              aria-pressed={failedOnly}
              aria-label="仅显示有失败运行的 Issue"
              data-testid="kanban-failed-only"
              title={
                failedCount > 0
                  ? `最近失败 run 覆盖 ${failedCount} 个 Issue`
                  : '最近无失败 run'
              }
              onClick={() => setFailedOnly(!failedOnly)}
            >
              仅失败{failedCount > 0 ? ` ${failedCount}` : ''}
            </button>
            {failedOnly ? (
              <span
                className="kanban-filter-note"
                data-testid="kanban-failed-filter-note"
                title="当前筛选下的可见 Issue 数（与列计数之和一致）"
              >
                <span>
                  显示 {visibleCount}
                  {failedCount > 0 && visibleCount !== failedCount
                    ? ` / 失败集 ${failedCount}`
                    : ''}
                </span>
                <span aria-hidden="true">·</span>
                <Link href="/runs?status=failed" className="kanban-filter-note-link" data-testid="kanban-fail-to-runs">
                  失败运行
                </Link>
                <span aria-hidden="true">·</span>
                <Link
                  href="/inbox?kind=run_failed&read=unread"
                  className="kanban-filter-note-link"
                  data-testid="kanban-fail-to-inbox"
                >
                  收件箱
                </Link>
                <span aria-hidden="true">·</span>
                <Link href="/settings" className="kanban-filter-note-link" data-testid="kanban-fail-to-settings">
                  环境
                </Link>
              </span>
            ) : null}
            <div className="kanban-label-filters" role="toolbar" aria-label="按标签筛选">
              <button
                type="button"
                className={`kanban-filter-pill${labelFilter === '' ? ' active' : ''}`}
                onClick={() => setLabelFilter('')}
              >
                全部标签
              </button>
              {(labels ?? []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`kanban-filter-pill${labelFilter === l.id ? ' active' : ''}`}
                  style={{ ['--label-color' as string]: l.color }}
                  onClick={() => setLabelFilter(l.id)}
                  title={l.name}
                >
                  <span className="issue-label-dot" />
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {hasActiveFilters ? (
        <div
          className="kanban-active-filters"
          data-testid="kanban-active-filters"
          aria-label="当前筛选"
        >
          {qFromUrl.trim() ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-q"
              onClick={() => {
                setQDraft('');
                const sp = new URLSearchParams(searchParams.toString());
                sp.delete('q');
                const qs = sp.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
              }}
            >
              搜索「{qFromUrl.trim()}」 ×
            </button>
          ) : null}
          {assigneeFromUrl ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-assignee"
              onClick={() => setAssigneeFilter('')}
            >
              指派 · {assigneeChipLabel} ×
            </button>
          ) : null}
          {priorityQuery ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-priority"
              onClick={() => setPriorityFilter('')}
            >
              优先级 · {priorityChip} ×
            </button>
          ) : null}
          {statusQuery ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-status"
              onClick={() => setStatusFilter('')}
            >
              状态 · {statusChipLabel} ×
            </button>
          ) : null}
          {originQuery ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-origin"
              onClick={() => setOriginFilter('')}
            >
              来源 · {originQuery === 'automation' ? '自动化' : '快速派活'} ×
            </button>
          ) : null}
          {projectFromUrl ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-project"
              onClick={() => setProjectFilter('')}
            >
              项目 · {projectChipName} ×
            </button>
          ) : null}
          {failedOnly ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-failed"
              onClick={() => setFailedOnly(false)}
            >
              仅失败 ×
            </button>
          ) : null}
          {labelFilter ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-label"
              onClick={() => setLabelFilter('')}
            >
              标签 · {labelChipName} ×
            </button>
          ) : null}
          <button
            type="button"
            className="kanban-active-chip kanban-active-chip--clear"
            data-testid="kanban-chip-clear-all"
            onClick={() => router.replace(pathname, { scroll: false })}
          >
            清除全部
          </button>
        </div>
      ) : null}
      {visibleCount === 0 && hasActiveFilters ? (
        <div className="kanban-empty-filter" data-testid="kanban-empty-filter">
          <EmptyState
            title="没有符合筛选的 Issue"
            icon="📭"
            description="试试清除筛选，或换到来源 / 指派 / 失败条件。"
            action={
              <div className="kanban-empty-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  data-testid="kanban-clear-filters"
                  onClick={() => router.replace(pathname, { scroll: false })}
                >
                  清除全部筛选
                </button>
                {originQuery === 'automation' ? (
                  <Link href="/automation" className="btn-secondary btn-sm">
                    打开自动化
                  </Link>
                ) : null}
                {failedOnly ? (
                  <>
                    <Link
                      href="/runs?status=failed"
                      className="btn-secondary btn-sm"
                      data-testid="kanban-empty-failed-runs"
                    >
                      失败运行
                    </Link>
                    <Link href="/settings" className="btn-ghost btn-sm" data-testid="kanban-empty-settings">
                      环境诊断
                    </Link>
                  </>
                ) : null}
              </div>
            }
          />
        </div>
      ) : null}
    </>
  );
}
