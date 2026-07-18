'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSkills, useRefreshSkills } from '@/lib/api';

type SourceFilter = '' | 'project' | 'user';

function parseSource(raw: string | null): SourceFilter {
  if (raw === 'project' || raw === 'user') return raw;
  return '';
}

// 照原型 renderSkills（app.js:619）+ URL 可分享筛选
function SkillsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isFetching } = useSkills();
  const refresh = useRefreshSkills();

  const qFromUrl = searchParams.get('q') ?? '';
  const sourceFromUrl = parseSource(searchParams.get('source'));
  const [qDraft, setQDraft] = useState(qFromUrl);

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
    <div className="page-container" data-testid="skills-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            Skills{' '}
            <span className="count" data-testid="skills-visible-count">
              {hasActiveFilters ? `${filtered.length}/${data.length}` : data.length}
            </span>
          </div>
          <div className="page-desc">工作区里任何智能体都能使用的指令。</div>
        </div>
        <div className="page-actions">
          <Link href="/agents" className="btn btn-ghost btn-sm" data-testid="skills-to-agents">
            智能体
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            重新扫描
          </button>
        </div>
      </div>

      <div className="agents-filters" data-testid="skills-filters">
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

      <div className="data-table-wrap">
        <table className="data-table" data-testid="skills-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>被谁使用</th>
              <th>来源</th>
              <th>简介</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((sk) => (
              <tr key={sk.name} data-skill-name={sk.name}>
                <td>
                  <strong>{sk.name}</strong>
                </td>
                <td>
                  {sk.usedBy.length > 0 ? (
                    sk.usedBy.map((a) => (
                      <Link
                        key={a.id}
                        href={`/agents/${a.id}`}
                        className="skill-tag skill-tag--link"
                        data-testid="skill-used-by"
                        data-agent-id={a.id}
                      >
                        {a.name}
                      </Link>
                    ))
                  ) : (
                    <span className="text-dim">— 未使用</span>
                  )}
                </td>
                <td>
                  <Link
                    href={`/skills?source=${encodeURIComponent(sk.source)}`}
                    className={`source-badge source-${sk.source} source-badge--link`}
                    data-testid="skill-source-link"
                    data-source={sk.source}
                    title={`筛选${sk.source === 'project' ? '项目级' : '用户级'} skill`}
                  >
                    {sk.source === 'project' ? '项目级' : '用户级'}
                  </Link>
                </td>
                <td className="text-dim text-sm">{sk.description || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-dim" style={{ textAlign: 'center' }}>
                  {isFetching ? (
                    '加载中…'
                  ) : (
                    <div data-testid="skills-empty">
                      <div>没有匹配的 skill</div>
                      {hasActiveFilters ? (
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            data-testid="skills-clear-search"
                            onClick={clearAll}
                          >
                            清除筛选
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
