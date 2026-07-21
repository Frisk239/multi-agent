'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LocalSkillCandidate, SkillImportTarget } from '@ma/shared';
import {
  useImportLocalSkills,
  useRefreshSkills,
  useScanLocalSkills,
  useSkills,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';

type SourceFilter = '' | 'project' | 'user';

function parseSource(raw: string | null): SourceFilter {
  if (raw === 'project' || raw === 'user') return raw;
  return '';
}

/**
 * Skills 页 + 本机导入（学 Multica CreateSkillDialog → runtime local import）
 * 目标存储：项目 <cwd>/.skills 或用户 ~/.multi-agent/skills
 */
function SkillsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isFetching } = useSkills();
  const refresh = useRefreshSkills();
  const scanLocal = useScanLocalSkills();
  const importLocal = useImportLocalSkills();

  const qFromUrl = searchParams.get('q') ?? '';
  const sourceFromUrl = parseSource(searchParams.get('source'));
  const [qDraft, setQDraft] = useState(qFromUrl);

  const [importOpen, setImportOpen] = useState(false);
  const [scanPath, setScanPath] = useState('');
  const [target, setTarget] = useState<SkillImportTarget>('project');
  const [candidates, setCandidates] = useState<LocalSkillCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [destHint, setDestHint] = useState<{ project: string | null; user: string } | null>(
    null,
  );
  const [lastResults, setLastResults] = useState<
    { name: string; status: string; error?: string }[] | null
  >(null);

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
  const selectedList = candidates.filter((c) => selected[c.key]);

  function clearAll() {
    setQDraft('');
    router.replace(pathname, { scroll: false });
  }

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    const path = scanPath.trim();
    if (!path || scanLocal.isPending) return;
    setScanError(null);
    setLastResults(null);
    try {
      const res = await scanLocal.mutateAsync(path);
      setDestHint({
        project: res.projectSkillsDir,
        user: res.userSkillsDir,
      });
      if (res.error) {
        setCandidates([]);
        setSelected({});
        setScanError(res.error);
        return;
      }
      setCandidates(res.candidates);
      const next: Record<string, boolean> = {};
      for (const c of res.candidates) {
        // 默认勾选未入库的
        next[c.key] = !c.alreadyIndexed;
      }
      setSelected(next);
      if (res.candidates.length === 0) {
        setScanError('未在该路径发现 skill（需 SKILL.md 或 *.md）');
      }
    } catch (err) {
      setCandidates([]);
      setSelected({});
      setScanError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onImport() {
    if (selectedList.length === 0 || importLocal.isPending) return;
    const res = await importLocal.mutateAsync({
      target,
      items: selectedList.map((c) => ({
        sourcePath: c.path,
        name: c.name,
        description: c.description || undefined,
        overwrite,
      })),
    });
    setLastResults(res.results);
    setDestHint({
      project: res.projectSkillsDir,
      user: res.userSkillsDir,
    });
    // 刷新候选 alreadyIndexed
    if (scanPath.trim()) {
      const again = await scanLocal.mutateAsync(scanPath.trim());
      setCandidates(again.candidates);
      const next: Record<string, boolean> = {};
      for (const c of again.candidates) next[c.key] = false;
      setSelected(next);
    }
  }

  function toggleAll(on: boolean) {
    const next: Record<string, boolean> = {};
    for (const c of candidates) next[c.key] = on;
    setSelected(next);
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
            工作区里任何智能体都能使用的指令。真源：项目{' '}
            <code>.skills/</code> 与用户 <code>~/.multi-agent/skills/</code>
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
            data-testid="skills-import-toggle"
            onClick={() => {
              setImportOpen((v) => !v);
              setLastResults(null);
            }}
          >
            {importOpen ? '收起导入' : '导入'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {importOpen ? (
          <section
            className="settings-card skills-import-panel"
            data-testid="skills-import-panel"
          >
            <div className="settings-section-head">
              <h2 className="settings-section-title" style={{ fontSize: '0.95rem' }}>
                从本机导入
              </h2>
              <p className="settings-section-desc">
                对齐 Multica「从 runtime 导入」：扫描本机 skill 目录/文件，写入本地{' '}
                <code>.skills</code>（非云端）
              </p>
            </div>

            <form className="skills-import-scan" onSubmit={onScan} data-testid="skills-import-scan">
              <label className="ops-field" style={{ flex: 1, minWidth: 0 }}>
                <span>本机路径</span>
                <input
                  className="input"
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  placeholder="例如 D:/code/skills 或含 SKILL.md 的目录"
                  data-testid="skills-import-path"
                />
              </label>
              <label className="ops-field">
                <span>写入目标</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as SkillImportTarget)}
                  data-testid="skills-import-target"
                  aria-label="导入目标"
                >
                  <option value="project">项目 · .skills</option>
                  <option value="user">用户 · ~/.multi-agent/skills</option>
                </select>
              </label>
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                data-testid="skills-import-scan-btn"
                disabled={!scanPath.trim() || scanLocal.isPending}
              >
                {scanLocal.isPending ? '扫描中…' : '扫描'}
              </button>
            </form>

            {destHint ? (
              <p className="text-dim text-sm skills-import-dest" data-testid="skills-import-dest">
                项目目录：{destHint.project ?? '（cwd 未配置）'}
                <br />
                用户目录：{destHint.user}
              </p>
            ) : null}

            {scanError ? (
              <p className="skills-import-error" data-testid="skills-import-error" role="alert">
                {scanError}
              </p>
            ) : null}

            {candidates.length > 0 ? (
              <>
                <div className="skills-import-toolbar">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    data-testid="skills-import-select-all"
                    onClick={() => toggleAll(true)}
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    data-testid="skills-import-select-none"
                    onClick={() => toggleAll(false)}
                  >
                    全不选
                  </button>
                  <label className="skills-import-overwrite">
                    <input
                      type="checkbox"
                      checked={overwrite}
                      onChange={(e) => setOverwrite(e.target.checked)}
                      data-testid="skills-import-overwrite"
                    />
                    覆盖已存在
                  </label>
                  <span className="text-dim text-sm">
                    已选 {selectedList.length} / {candidates.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    data-testid="skills-import-submit"
                    disabled={selectedList.length === 0 || importLocal.isPending}
                    onClick={() => void onImport()}
                  >
                    {importLocal.isPending
                      ? '导入中…'
                      : `导入 ${selectedList.length || ''}`.trim()}
                  </button>
                </div>

                <ul className="skills-import-list" data-testid="skills-import-list">
                  {candidates.map((c) => (
                    <li
                      key={c.key}
                      className={`skills-import-item${selected[c.key] ? ' is-selected' : ''}`}
                      data-testid="skills-import-item"
                      data-skill-name={c.name}
                    >
                      <label className="skills-import-item-label">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[c.key])}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [c.key]: e.target.checked,
                            }))
                          }
                          data-testid="skills-import-check"
                        />
                        <span className="skills-import-item-body">
                          <span className="skills-import-item-name">
                            <strong>{c.name}</strong>
                            <span className="text-dim text-sm"> · {c.kind}</span>
                            {c.alreadyIndexed ? (
                              <span
                                className="skills-import-badge"
                                data-testid="skills-import-exists"
                              >
                                已在索引
                                {c.existingSource
                                  ? `（${c.existingSource === 'project' ? '项目' : '用户'}）`
                                  : ''}
                              </span>
                            ) : null}
                          </span>
                          {c.description ? (
                            <span className="text-dim text-sm skills-import-item-desc">
                              {c.description}
                            </span>
                          ) : null}
                          <span className="skills-import-item-path text-dim text-sm" title={c.path}>
                            {c.path}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {lastResults && lastResults.length > 0 ? (
              <div className="skills-import-results" data-testid="skills-import-results">
                <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
                  导入结果
                </div>
                <ul>
                  {lastResults.map((r, i) => (
                    <li key={`${r.name}-${i}`} data-status={r.status}>
                      <code>{r.status}</code> {r.name}
                      {r.error ? ` — ${r.error}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

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
            description="把 skill 放到项目 .skills/ 或点「导入」从本机目录写入。"
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="skills-empty-import"
                onClick={() => setImportOpen(true)}
              >
                导入 skill
              </button>
            }
          />
        ) : (
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
        )}
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
