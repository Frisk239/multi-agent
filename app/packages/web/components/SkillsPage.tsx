'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRefreshSkills, useSkills } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';
import { CreateSkillDialog } from './CreateSkillDialog';

type SourceFilter = '' | 'project' | 'user';

function parseSource(raw: string | null): SourceFilter {
  if (raw === 'project' || raw === 'user') return raw;
  return '';
}

/**
 * Skills 列表 + Multica 式「新建 skill」弹层（URL / 本机，无手动创建）
 */
function SkillsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isFetching, refetch } = useSkills();
  const refresh = useRefreshSkills();

  const qFromUrl = searchParams.get('q') ?? '';
  const sourceFromUrl = parseSource(searchParams.get('source'));
  const [qDraft, setQDraft] = useState(qFromUrl);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  function replaceParams(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qDraft.trim();
      if (next === qFromUrl.trim()) return;
      replaceParams({ q: next || null });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = qFromUrl.trim().toLowerCase();
    return list.filter((s) => {
      if (sourceFromUrl && s.source !== sourceFromUrl) return false;
      if (q) {
        const hay = `${s.name} ${s.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, qFromUrl, sourceFromUrl]);

  const hasActiveFilters = Boolean(qFromUrl.trim() || sourceFromUrl);

  function clearAll() {
    setQDraft('');
    router.replace(pathname, { scroll: false });
  }

  if (!data) return <div className="page-container">加载中…</div>;

  return (
    <div className="page-container collection-page skills-page" data-testid="skills-page">
      <div className="page-header">
        <div>
          <Icon name="skills" size={16} className="page-header-icon" />
          <h1 className="page-title">
            Skills{' '}
            <span className="count" data-testid="skills-visible-count">
              {hasActiveFilters ? `${filtered.length}/${data.length}` : data.length}
            </span>
          </h1>
          <p className="page-desc page-desc--quiet">
            工作区里任何智能体都能使用的指令。真源：项目 <code>.skills/</code> 与用户{' '}
            <code>~/.multi-agent/skills/</code>
          </p>
        </div>
        <div className="page-actions">
          <PageHeaderMore testId="skills-header-more">
            <Link href="/agents" data-testid="skills-to-agents" role="menuitem">
              智能体
            </Link>
            <button
              type="button"
              data-testid="skills-refresh"
              role="menuitem"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              {refresh.isPending ? '扫描中…' : '重新扫描'}
            </button>
          </PageHeaderMore>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="skills-create-open"
            onClick={() => setCreateOpen(true)}
          >
            新建 skill
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="agents-filters collection-toolbar" data-testid="skills-filters">
          <div className="table-search memory-search-wrap">
            <input
              type="search"
              placeholder="搜索 skill..."
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              data-testid="skills-search"
              aria-label="搜索 skill"
            />
            {qFromUrl.trim() ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                data-testid="skills-search-clear"
                onClick={() => {
                  setQDraft('');
                  replaceParams({ q: null });
                }}
              >
                清除
              </button>
            ) : null}
          </div>
          <label className="agents-filter-field">
            来源
            <select
              value={sourceFromUrl}
              data-testid="skills-source-filter"
              onChange={(e) => replaceParams({ source: e.target.value || null })}
              aria-label="按来源筛选 skill"
            >
              <option value="">全部</option>
              <option value="project">项目级</option>
              <option value="user">用户级</option>
            </select>
          </label>
        </div>

        {hasActiveFilters ? (
          <div
            className="agents-active-filters"
            data-testid="skills-active-filters"
            aria-label="当前筛选"
          >
            {qFromUrl.trim() ? (
              <button
                type="button"
                className="kanban-active-chip"
                data-testid="skills-chip-q"
                onClick={() => {
                  setQDraft('');
                  replaceParams({ q: null });
                }}
              >
                搜索「{qFromUrl.trim()}」 ×
              </button>
            ) : null}
            {sourceFromUrl ? (
              <button
                type="button"
                className="kanban-active-chip"
                data-testid="skills-chip-source"
                onClick={() => replaceParams({ source: null })}
              >
                来源 · {sourceFromUrl === 'project' ? '项目级' : '用户级'} ×
              </button>
            ) : null}
            <button
              type="button"
              className="kanban-active-chip kanban-active-chip--clear"
              data-testid="skills-chip-clear-all"
              onClick={clearAll}
            >
              清除全部
            </button>
          </div>
        ) : null}

        {data.length === 0 ? (
          <EmptyState
            title="还没有 skill"
            description="点「新建 skill」从 URL 或本机路径导入到工作区。"
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="skills-empty-create"
                onClick={() => setCreateOpen(true)}
              >
                新建 skill
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="skills-empty-filter" data-testid="skills-empty">
            <p className="text-dim">没有匹配的 skill</p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                data-testid="skills-clear-search"
                onClick={clearAll}
              >
                清除筛选
              </button>
            ) : null}
          </div>
        ) : (
          <div className="skills-list-wrap" data-testid="skills-table">
            <div className="skills-list-head" aria-hidden>
              <span>名称</span>
              <span>被谁使用</span>
              <span>来源</span>
              <span className="skills-list-head-desc">简介</span>
            </div>
            <ul className="skills-list" data-testid="skills-list">
              {filtered.map((sk) => (
                <li key={sk.name}>
                  <button
                    type="button"
                    className="skills-list-row"
                    data-testid="skills-list-row"
                    data-skill-name={sk.name}
                    onClick={() =>
                      router.push(`/skills/${encodeURIComponent(sk.name)}`)
                    }
                  >
                    <span className="skills-list-name">
                      <strong>{sk.name}</strong>
                    </span>
                    <span className="skills-list-usedby" data-testid="skill-used-by-cell">
                      {sk.usedBy.length === 0 ? (
                        <span className="text-dim skills-unused">— 未使用</span>
                      ) : sk.usedBy.length === 1 ? (
                        <span
                          className="skills-usedby-one"
                          data-testid="skill-used-by"
                          title={sk.usedBy[0]!.name}
                        >
                          <span className="skills-usedby-avatar" aria-hidden>
                            {sk.usedBy[0]!.name.slice(0, 1)}
                          </span>
                          <span className="skills-usedby-label">{sk.usedBy[0]!.name}</span>
                        </span>
                      ) : (
                        <span
                          className="skills-usedby-stack"
                          title={sk.usedBy.map((a) => a.name).join('、')}
                        >
                          {sk.usedBy.slice(0, 3).map((a) => (
                            <span
                              key={a.id}
                              className="skills-usedby-avatar"
                              data-testid="skill-used-by"
                              data-agent-id={a.id}
                            >
                              {a.name.slice(0, 1)}
                            </span>
                          ))}
                          {sk.usedBy.length > 3 ? (
                            <span className="skills-usedby-extra">
                              +{sk.usedBy.length - 3}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </span>
                    <span
                      className={`source-badge source-${sk.source}`}
                      data-testid="skill-source"
                      data-source={sk.source}
                    >
                      {sk.source === 'project' ? '项目级' : '用户级'}
                    </span>
                    <span className="skills-list-desc text-dim text-sm">
                      {sk.description || '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {isFetching ? (
              <p className="text-dim text-sm" style={{ padding: '8px 4px' }}>
                刷新中…
              </p>
            ) : null}
          </div>
        )}
      </div>

      <CreateSkillDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onImported={() => {
          void refetch();
          void refresh.mutateAsync().catch(() => undefined);
        }}
      />
    </div>
  );
}

export function SkillsPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <SkillsPageInner />
    </Suspense>
  );
}
