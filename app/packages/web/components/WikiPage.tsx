'use client';
import { useState } from 'react';
import { useWikiPages, useWikiPage } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';

// S06 Wiki 浏览器（spec §7.1）
// 左侧页面列表 + 右侧 markdown 渲染（复用 S02 MarkdownBody）
// 照 concepts llm-wiki-pattern.md：Agent 写，人只读
export function WikiPage() {
  const { data: pages, isFetching } = useWikiPages();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { data: currentPage } = useWikiPage(selectedSlug);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            Wiki <span className="count">{pages?.length ?? 0}</span>
          </div>
          <div className="page-desc">Issue 完成时自动生成的知识页（LLM 编译式 Wiki）。</div>
        </div>
      </div>

      <div className="wiki-layout">
        {/* 左侧列表 */}
        <div className="wiki-sidebar">
          {isFetching && !pages && <div className="text-dim">加载中…</div>}
          {pages && pages.length === 0 && (
            <div className="text-dim">还没有 Wiki 页。完成一个 Issue（拖到 Done）试试。</div>
          )}
          {pages?.map((p) => (
            <button
              key={p.slug}
              type="button"
              className={`wiki-list-item${selectedSlug === p.slug ? ' active' : ''}`}
              onClick={() => setSelectedSlug(p.slug)}
            >
              {p.title}
            </button>
          ))}
        </div>

        {/* 右侧渲染 */}
        <div className="wiki-content">
          {!selectedSlug && <div className="text-dim">← 从左侧选择一个页面</div>}
          {selectedSlug && !currentPage && <div className="text-dim">加载中…</div>}
          {currentPage && <MarkdownBody source={currentPage.content} />}
        </div>
      </div>
    </div>
  );
}
