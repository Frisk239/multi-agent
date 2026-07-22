'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useProjects,
  useWikiMeta,
  useWikiPages,
  useWikiPage,
} from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';
import { WikiQueryDialog } from './WikiQueryDialog';
import { WikiHealthPanel } from './WikiHealthPanel';
import { WikiJobsPanel } from './WikiJobsPanel';
import { PageHeaderMore } from './PageHeaderMore';

// S06 Wiki 浏览器 + S07 + wiki-memory-ops + DS3 per-project；?slug= / ?q= / ?projectId= 可分享
function WikiPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedSlug = searchParams.get('slug');
  const showQuery = searchParams.get('query') === '1';
  const qFromUrl = searchParams.get('q') ?? '';
  const projectIdFromUrl = searchParams.get('projectId') ?? '';
  const [qDraft, setQDraft] = useState(qFromUrl);

  const { data: projects = [] } = useProjects();
  const { data: pages, isFetching } = useWikiPages(projectIdFromUrl || null);
  const { data: currentPage } = useWikiPage(selectedSlug, projectIdFromUrl || null);
  const { data: wikiMeta } = useWikiMeta(projectIdFromUrl || null);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  const patchSearch = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      mutate(sp);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSelectedSlug = useCallback(
    (slug: string | null) => {
      patchSearch((sp) => {
        if (slug) sp.set('slug', slug);
        else sp.delete('slug');
      });
    },
    [patchSearch],
  );

  const setProjectId = useCallback(
    (next: string) => {
      patchSearch((sp) => {
        if (next) sp.set('projectId', next);
        else sp.delete('projectId');
        // 换根后 slug 可能无效；交给下方 effect 清
      });
    },
    [patchSearch],
  );

  const setShowQueryDialog = useCallback(
    (open: boolean) => {
      patchSearch((sp) => {
        if (open) sp.set('query', '1');
        else sp.delete('query');
      });
    },
    [patchSearch],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qDraft.trim();
      if (next === qFromUrl.trim()) return;
      patchSearch((sp) => {
        if (next) sp.set('q', next);
        else sp.delete('q');
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [qDraft, qFromUrl, patchSearch]);

  // 无效 slug：列表加载后若不存在则清掉（保留其它 query；换 project 时自然触发）
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
  const isProjectRoot = wikiMeta?.source === 'project';
  const shareSlugHref = useMemo(() => {
    const sp = new URLSearchParams();
    if (selectedSlug) sp.set('slug', selectedSlug);
    if (projectIdFromUrl) sp.set('projectId', projectIdFromUrl);
    const qs = sp.toString();
    return qs ? `/wiki?${qs}` : '/wiki';
  }, [selectedSlug, projectIdFromUrl]);

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
          <div className="page-desc page-desc--quiet">
            编译式项目知识库（llm-wiki）：Issue 完成后 ingest 成互链 Markdown；问答可引用页并回写。
            与 Multica 看板派活互补——看板管「做」，Wiki 管「沉淀」。
          </div>
          {wikiMeta ? (
            <p
              className="knowledge-root-banner"
              data-testid="wiki-root-banner"
              title={wikiMeta.note}
            >
              存储根 · <code>{wikiMeta.rootPath}</code>
              {' · '}
              {isProjectRoot ? (
                <strong>按项目分根</strong>
              ) : (
                <strong>全局根</strong>
              )}
              （来源 {wikiMeta.source}
              {wikiMeta.projectId ? ` · project ${wikiMeta.projectId}` : ''}）
            </p>
          ) : null}
        </div>
        <div className="page-actions">
          <label className="text-sm text-dim" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="sr-only">Wiki 项目根</span>
            <select
              className="new-issue-select"
              value={projectIdFromUrl}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Wiki 项目根"
              data-testid="wiki-project-select"
            >
              <option value="">全局 Wiki</option>
              {projects.map((p) => {
                const pathHint = p.localPath
                  ? p.localPathExists
                    ? ' · 已绑目录'
                    : ' · 路径无效'
                  : ' · 未绑目录';
                return (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {pathHint}
                  </option>
                );
              })}
            </select>
          </label>
          <PageHeaderMore testId="wiki-header-more">
            <Link href="/memory" data-testid="wiki-to-memory" role="menuitem">
              记忆
            </Link>
            <Link href="/runs" data-testid="wiki-to-runs" role="menuitem">
              运行
            </Link>
            <Link href="/" data-testid="wiki-to-board" role="menuitem">
              看板
            </Link>
            <Link href="/settings" data-testid="wiki-to-settings" role="menuitem">
              环境
            </Link>
            <Link
              href="/wiki?jobStatus=dead"
              data-testid="wiki-to-dead-jobs"
              role="menuitem"
            >
              dead 任务
            </Link>
          </PageHeaderMore>
          <button
            type="button"
            className="btn-primary btn-sm"
            data-testid="wiki-open-query"
            onClick={() => setShowQueryDialog(true)}
          >
            问答
          </button>
        </div>
      </div>

      <div className="knowledge-bridge" data-testid="wiki-knowledge-bridge">
        <div className="knowledge-bridge-text">
          <strong>闭环</strong>
          <span className="text-dim text-sm">
            完成 Issue → 编译任务 → Wiki 页；提问结果可再沉淀。绑 project 的 Issue 写入该仓
            localPath/wiki。运维项默认折叠，避免盖住阅读。
          </span>
        </div>
        <div className="knowledge-bridge-actions">
          <Link
            href="/wiki?jobStatus=dead"
            className="btn-ghost btn-sm"
            data-testid="wiki-bridge-dead-jobs"
          >
            编译任务
          </Link>
          <Link href="/settings" className="btn-ghost btn-sm" data-testid="wiki-bridge-settings">
            环境
          </Link>
        </div>
      </div>

      <details className="wiki-ops-fold" data-testid="wiki-ops-fold">
        <summary className="wiki-ops-fold-summary">
          编译与健康 <span className="text-dim text-sm">ingest / dead / lint</span>
        </summary>
        <div className="wiki-ops-fold-body">
          <Suspense fallback={<div className="text-dim text-sm">加载编译任务…</div>}>
            <WikiJobsPanel />
          </Suspense>
          <WikiHealthPanel
            projectId={projectIdFromUrl || null}
            onSelectPage={setSelectedSlug}
          />
        </div>
      </details>

      {showQuery && (
        <WikiQueryDialog
          projectId={projectIdFromUrl || null}
          onClose={() => setShowQueryDialog(false)}
        />
      )}

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
                patchSearch((sp) => {
                  sp.delete('q');
                });
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
                patchSearch((sp) => {
                  sp.delete('q');
                });
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
                {projectIdFromUrl
                  ? ' 当前为项目根：无 localPath 或路径无效时会回退全局根。'
                  : ''}
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
                  patchSearch((sp) => {
                    sp.delete('q');
                  });
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
                  href={shareSlugHref}
                  className="btn-ghost btn-sm"
                  data-testid="wiki-copy-slug-link"
                  title="可分享链接（当前页 + 当前根）"
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
