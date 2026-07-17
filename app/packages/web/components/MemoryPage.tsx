'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useMemoryStatus,
  useMemoryList,
  useCreateMemory,
  useSettingsStatus,
} from '@/lib/api';

function inferKind(text: string): 'curated' | 'ambient' | 'other' {
  const t = text.trim();
  if (t.startsWith('ambient:') || t.startsWith('[ambient]')) return 'ambient';
  if (t.startsWith('User:') || t.startsWith('Outcome:')) return 'other';
  return 'curated';
}

// S11 /memory + URL ?q= 可分享搜索（日常知识入口）
function MemoryPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qFromUrl = searchParams.get('q') ?? '';
  const kindFromUrl = searchParams.get('kind') ?? '';

  const { data: status } = useMemoryStatus();
  const { data: settings } = useSettingsStatus();
  const [qDraft, setQDraft] = useState(qFromUrl);
  const { data, isFetching, isError, error } = useMemoryList(qFromUrl);
  const create = useCreateMemory();
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  // 防抖写 URL → 再由 URL 驱动 useMemoryList
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qDraft.trim();
      if (next === qFromUrl.trim()) return;
      const sp = new URLSearchParams(searchParams.toString());
      if (next) sp.set('q', next);
      else sp.delete('q');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
    return () => window.clearTimeout(t);
  }, [qDraft, qFromUrl, pathname, router, searchParams]);

  const statusLabel = status
    ? status.available
      ? [status.provider, (status as { backend?: string }).backend]
          .filter(Boolean)
          .join(' / ')
      : `${status.provider ?? 'none'}（不可用）`
    : '…';

  const embedOk = settings?.secrets?.embeddingConfigured;
  const showUnavailable = status != null && !status.available;
  const hasQuery = qFromUrl.trim().length > 0;

  const kindCounts = useMemo(() => {
    const c = { curated: 0, ambient: 0, other: 0 };
    for (const m of data ?? []) {
      c[inferKind(m.text)] += 1;
    }
    return c;
  }, [data]);

  function clearSearch() {
    setQDraft('');
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('q');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setKindFilter(kind: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (kind === 'curated' || kind === 'ambient' || kind === 'other') sp.set('kind', kind);
    else sp.delete('kind');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const kindFilter =
    kindFromUrl === 'curated' || kindFromUrl === 'ambient' || kindFromUrl === 'other'
      ? kindFromUrl
      : '';

  const visibleMemories = useMemo(() => {
    const list = data ?? [];
    if (!kindFilter) return list;
    return list.filter((m) => inferKind(m.text) === kindFilter);
  }, [data, kindFilter]);

  async function handleCreate() {
    const text = draft.trim();
    if (!text) {
      setFormError('请输入记忆内容');
      return;
    }
    setFormError(null);
    try {
      await create.mutateAsync({ text });
      setDraft('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '创建失败');
    }
  }

  async function copyMemoryId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopyId(id);
      window.setTimeout(() => setCopyId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="page-container" data-testid="memory-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            记忆 <span className="count">{data?.length ?? 0}</span>
          </div>
          <div className="page-desc">
            工作区经验记忆（curated + ambient）。搜索同步 URL（?q=）。provider：
            {statusLabel}
          </div>
        </div>
        <div className="page-actions">
          <Link href="/settings" className="btn-secondary btn-sm">
            环境诊断
          </Link>
        </div>
      </div>

      {showUnavailable ? (
        <div className="wiki-ops-banner" role="status">
          <div className="wiki-ops-banner-main">
            <strong>记忆 provider 不可用</strong>
            <p className="text-sm">
              当前无法检索或写入记忆。请到设置页查看 memory / embedding 诊断
              {embedOk === false ? '（embedding 可能未配置）' : ''}。
            </p>
          </div>
          <Link href="/settings" className="btn-secondary btn-sm">
            打开设置
          </Link>
        </div>
      ) : null}

      <div className="memory-create">
        <textarea
          className="memory-textarea"
          rows={3}
          placeholder="写入一条记忆…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={create.isPending || showUnavailable}
          aria-label="新记忆内容"
          data-testid="memory-create-input"
        />
        <div className="memory-create-actions">
          {formError && (
            <span className="text-sm" style={{ color: 'var(--color-red)' }}>
              {formError}
              {' · '}
              <Link href="/settings">去设置</Link>
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            data-testid="memory-create-submit"
            onClick={() => void handleCreate()}
            disabled={create.isPending || !draft.trim() || showUnavailable}
          >
            {create.isPending ? '写入中…' : '写入记忆'}
          </button>
        </div>
      </div>

      <div className="memory-toolbar">
        <div className="table-search memory-search-wrap">
          <input
            type="search"
            placeholder="搜索记忆…（同步 ?q=）"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            disabled={showUnavailable}
            aria-label="搜索记忆"
            data-testid="memory-search"
          />
          {hasQuery || qDraft.trim() ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              data-testid="memory-search-clear"
              onClick={clearSearch}
            >
              清除
            </button>
          ) : null}
        </div>
        {!showUnavailable && data ? (
          <div className="memory-kind-summary" data-testid="memory-kind-summary">
            <button
              type="button"
              className={`memory-kind-chip memory-kind-chip--curated${kindFilter === 'curated' ? ' is-active' : ''}`}
              data-testid="memory-kind-filter-curated"
              aria-pressed={kindFilter === 'curated'}
              onClick={() => setKindFilter(kindFilter === 'curated' ? '' : 'curated')}
            >
              curated {kindCounts.curated}
            </button>
            <button
              type="button"
              className={`memory-kind-chip memory-kind-chip--ambient${kindFilter === 'ambient' ? ' is-active' : ''}`}
              data-testid="memory-kind-filter-ambient"
              aria-pressed={kindFilter === 'ambient'}
              onClick={() => setKindFilter(kindFilter === 'ambient' ? '' : 'ambient')}
            >
              ambient {kindCounts.ambient}
            </button>
            {kindCounts.other > 0 ? (
              <button
                type="button"
                className={`memory-kind-chip${kindFilter === 'other' ? ' is-active' : ''}`}
                data-testid="memory-kind-filter-other"
                aria-pressed={kindFilter === 'other'}
                onClick={() => setKindFilter(kindFilter === 'other' ? '' : 'other')}
              >
                other {kindCounts.other}
              </button>
            ) : null}
            {hasQuery ? (
              <span className="text-dim text-sm">筛选「{qFromUrl.trim()}」</span>
            ) : null}
            {kindFilter ? (
              <span className="text-dim text-sm" data-testid="memory-kind-filter-note">
                类型 · {kindFilter}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {(hasQuery || kindFilter) ? (
        <div
          className="memory-active-filters"
          data-testid="memory-active-filters"
          aria-label="当前筛选"
        >
          {hasQuery ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="memory-chip-q"
              onClick={clearSearch}
            >
              搜索「{qFromUrl.trim()}」 ×
            </button>
          ) : null}
          {kindFilter ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="memory-chip-kind"
              onClick={() => setKindFilter('')}
            >
              类型 · {kindFilter} ×
            </button>
          ) : null}
          <button
            type="button"
            className="kanban-active-chip kanban-active-chip--clear"
            data-testid="memory-chip-clear-all"
            onClick={() => {
              setQDraft('');
              router.replace(pathname, { scroll: false });
            }}
          >
            清除全部
          </button>
        </div>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table" data-testid="memory-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>内容</th>
              <th>Issue</th>
              <th>时间</th>
              <th>id</th>
            </tr>
          </thead>
          <tbody>
            {isError && (
              <tr>
                <td colSpan={5} className="text-dim" style={{ textAlign: 'center' }}>
                  {error instanceof Error ? error.message : '加载失败'}
                  {' · '}
                  <Link href="/settings">打开设置诊断</Link>
                </td>
              </tr>
            )}
            {!isError &&
              visibleMemories.map((m) => {
                const kind = inferKind(m.text);
                return (
                  <tr key={m.id} data-memory-id={m.id} data-memory-kind={kind}>
                    <td>
                      <span
                        className={`memory-kind-chip memory-kind-chip--${kind}`}
                        data-testid="memory-kind"
                      >
                        {kind}
                      </span>
                    </td>
                    <td>
                      <div className="memory-text">{m.text}</div>
                    </td>
                    <td className="text-dim text-sm">
                      {m.issueId ? (
                        <Link href={`/issues/${m.issueId}`}>
                          <code>{m.issueId.slice(0, 8)}…</code>
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-dim text-sm">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="text-dim text-sm">
                      <button
                        type="button"
                        className="memory-id-copy"
                        title={m.id}
                        data-testid="memory-copy-id"
                        onClick={() => void copyMemoryId(m.id)}
                      >
                        <code>{copyId === m.id ? '已复制' : `${m.id.slice(0, 8)}…`}</code>
                      </button>
                    </td>
                  </tr>
                );
              })}
            {!isError && visibleMemories.length === 0 && (
              <tr>
                <td colSpan={5} className="text-dim" style={{ textAlign: 'center' }}>
                  {isFetching ? (
                    '加载中…'
                  ) : showUnavailable ? (
                    '记忆不可用，无法列出条目'
                  ) : hasQuery || kindFilter ? (
                    <div data-testid="memory-empty-filter">
                      <div>没有符合筛选的记忆</div>
                      <div className="memory-empty-actions">
                        {hasQuery ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            data-testid="memory-clear-q"
                            onClick={clearSearch}
                          >
                            清除搜索
                          </button>
                        ) : null}
                        {kindFilter ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            data-testid="memory-clear-kind"
                            onClick={() => setKindFilter('')}
                          >
                            清除类型
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          data-testid="memory-clear-filters"
                          onClick={() => {
                            setQDraft('');
                            router.replace(pathname, { scroll: false });
                          }}
                        >
                          清除全部
                        </button>
                      </div>
                    </div>
                  ) : (
                    '还没有记忆。可在上方写入一条，或完成 Issue 产生 ambient。'
                  )}
                </td>
              </tr>
            )}
            {!isError && !data && (
              <tr>
                <td colSpan={5} className="text-dim" style={{ textAlign: 'center' }}>
                  加载中…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MemoryPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <MemoryPageInner />
    </Suspense>
  );
}
