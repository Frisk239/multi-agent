'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useWikiPages, useWikiPage } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';
import { WikiQueryDialog } from './WikiQueryDialog';
import { WikiHealthPanel } from './WikiHealthPanel';
import { WikiJobsPanel } from './WikiJobsPanel';

// S06 Wiki 浏览器 + S07 + wiki-memory-ops；?slug= / ?q= 可分享
function WikiPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedSlug = searchParams.get('slug');
  const showQuery = searchParams.get('query') === '1';
  const qFromUrl = searchParams.get('q') ?? '';
  const [qDraft, setQDraft] = useState(qFromUrl);

  const { data: pages, isFetching } = useWikiPages();
  const { data: currentPage } = useWikiPage(selectedSlug);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  const setSelectedSlug = useCallback(
    (slug: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (slug) sp.set('slug', slug);
      else sp.delete('slug');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setShowQueryDialog = useCallback(
    (open: boolean) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (open) sp.set('query', '1');
      else sp.delete('query');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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

  // 无效 slug：列表加载后若不存在则清掉（保留其它 query）
  useEffect(() => {
    if (!selectedSlug || !pages) return;
    if (pages.some((p) => p.slug === selectedSlug)) return;
    setSelectedSlug(null);
  }, [pages, selectedSlug, setSelectedSlug]);

  const visiblePages = useMemo(() => {
    const list = pages ?? [];
    const q = qFromUrl.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q),
    );
  }, [pages, qFromUrl]);

  const hasQuery = qFromUrl.trim().length > 0;

  return (
    <div className="page-container" data-testid="wiki-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            Wiki{' '}
            <span className="count" data-testid="wiki-visible-count">
              {hasQuery ? `${visiblePages.length}/${pages?.length ?? 0}` : (pages?.length ?? 0)}
            </span>
          </div>
          <div className="page-desc">
            Issue 完成时自动生成的知识页。选中页同步 URL（?slug=）可分享；列表支持 ?q=。
          </div>
        </div>
        <div className="page-actions">
          <Link href="/memory" className="btn-ghost btn-sm" data-testid="wiki-to-memory">
            记忆
          </Link>
          <Link href="/settings" className="btn-ghost btn-sm" data-testid="wiki-to-settings">
            环境
          </Link>
          <Link
            href="/wiki?jobStatus=dead"
            className="btn-secondary btn-sm"
            data-testid="wiki-to-dead-jobs"
          >
            dead 任务
          </Link>
          <button
            type="button"
            className="btn-primary"
            data-testid="wiki-open-query"
            onClick={() => setShowQueryDialog(true)}
          >
            问答
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="text-dim text-sm">加载编译任务…</div>}>
        <WikiJobsPanel />
      </Suspense>

      <WikiHealthPanel onSelectPage={setSelectedSlug} />

      {showQuery && <WikiQueryDialog onClose={() => setShowQueryDialog(false)} />}

      <div className="wiki-list-search" data-testid="wiki-list-search">
        <div className="table-search memory-search-wrap">
          <input
            type="search"
            placeholder="筛选 Wiki 标题 / slug…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            data-testid="wiki-search"
            aria-label="筛选 Wiki 列表"
          />
          {hasQuery ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              data-testid="wiki-search-clear"
              onClick={() => {
                setQDraft('');
                const sp = new URLSearchParams(searchParams.toString());
                sp.delete('q');
                const qs = sp.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
              }}
            >
              清除
            </button>
          ) : null}
        </div>
        {hasQuery ? (
          <div className="agents-active-filters" data-testid="wiki-active-filters">
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="wiki-chip-q"
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
          </div>
        ) : null}
      </div>

      <div className="wiki-layout">
        <div className="wiki-sidebar" data-testid="wiki-sidebar">
          {isFetching && !pages && <div className="text-dim">加载中…</div>}
          {pages && pages.length === 0 && (
            <div className="text-dim" data-testid="wiki-empty">
              <div>
                还没有 Wiki 页。完成一个 Issue（拖到 Done）试试。若一直为空，检查上方编译任务是否
                dead，以及设置页 Wiki LLM 是否就绪。
              </div>
              <div className="memory-empty-actions" style={{ marginTop: 8 }}>
                <Link href="/" className="btn-secondary btn-sm" data-testid="wiki-empty-board">
                  去看板
                </Link>
                <Link
                  href="/settings"
                  className="btn-ghost btn-sm"
                  data-testid="wiki-empty-settings"
                >
                  环境诊断
                </Link>
                <Link
                  href="/wiki?jobStatus=dead"
                  className="btn-ghost btn-sm"
                  data-testid="wiki-empty-dead"
                >
                  dead 任务
                </Link>
              </div>
            </div>
          )}
          {pages && pages.length > 0 && visiblePages.length === 0 ? (
            <div className="text-dim" data-testid="wiki-empty-filter">
              <div>没有匹配的页面</div>
              <button
                type="button"
                className="btn-secondary btn-sm"
                style={{ marginTop: 8 }}
                data-testid="wiki-clear-filter"
                onClick={() => {
                  setQDraft('');
                  const sp = new URLSearchParams(searchParams.toString());
                  sp.delete('q');
                  const qs = sp.toString();
                  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                }}
              >
                清除筛选
              </button>
            </div>
          ) : null}
          {visiblePages.map((p) => (
            <button
              key={p.slug}
              type="button"
              data-wiki-slug={p.slug}
              className={`wiki-list-item${selectedSlug === p.slug ? ' active' : ''}`}
              onClick={() => setSelectedSlug(p.slug)}
            >
              {p.title}
            </button>
          ))}
        </div>

        <div className="wiki-content" data-testid="wiki-content">
          {!selectedSlug && <div className="text-dim">← 从左侧选择一个页面</div>}
          {selectedSlug && !currentPage && <div className="text-dim">加载中…</div>}
          {currentPage && (
            <div data-testid="wiki-page-body" data-slug={currentPage.slug ?? selectedSlug}>
              <div className="wiki-page-meta" data-testid="wiki-page-meta">
                <code className="text-dim text-sm">{currentPage.slug ?? selectedSlug}</code>
                <Link
                  href={`/wiki?slug=${encodeURIComponent(currentPage.slug ?? selectedSlug ?? '')}`}
                  className="btn-ghost btn-sm"
                  data-testid="wiki-copy-slug-link"
                  title="可分享链接（当前页）"
                >
                  分享链
                </Link>
                <Link href="/memory" className="btn-ghost btn-sm" data-testid="wiki-meta-to-memory">
                  记忆
                </Link>
              </div>
              <MarkdownBody source={currentPage.content} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WikiPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <WikiPageInner />
    </Suspense>
  );
}
