'use client';

import { Suspense, useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useWikiPages, useWikiPage } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';
import { WikiQueryDialog } from './WikiQueryDialog';
import { WikiHealthPanel } from './WikiHealthPanel';
import { WikiJobsPanel } from './WikiJobsPanel';

// S06 Wiki 浏览器 + S07 + wiki-memory-ops；?slug= 可分享选中页
function WikiPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedSlug = searchParams.get('slug');
  const showQuery = searchParams.get('query') === '1';

  const { data: pages, isFetching } = useWikiPages();
  const { data: currentPage } = useWikiPage(selectedSlug);

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

  // 无效 slug：列表加载后若不存在则清掉（保留其它 query）
  useEffect(() => {
    if (!selectedSlug || !pages) return;
    if (pages.some((p) => p.slug === selectedSlug)) return;
    setSelectedSlug(null);
  }, [pages, selectedSlug, setSelectedSlug]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            Wiki <span className="count">{pages?.length ?? 0}</span>
          </div>
          <div className="page-desc">
            Issue 完成时自动生成的知识页。选中页同步 URL（?slug=）可分享。
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowQueryDialog(true)}
          >
            问答
          </button>
        </div>
      </div>

      <WikiJobsPanel />

      <WikiHealthPanel onSelectPage={setSelectedSlug} />

      {showQuery && <WikiQueryDialog onClose={() => setShowQueryDialog(false)} />}

      <div className="wiki-layout">
        <div className="wiki-sidebar" data-testid="wiki-sidebar">
          {isFetching && !pages && <div className="text-dim">加载中…</div>}
          {pages && pages.length === 0 && (
            <div className="text-dim">
              还没有 Wiki 页。完成一个 Issue（拖到 Done）试试。若一直为空，检查上方编译任务是否
              dead，以及设置页 Wiki LLM 是否就绪。
            </div>
          )}
          {pages?.map((p) => (
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
