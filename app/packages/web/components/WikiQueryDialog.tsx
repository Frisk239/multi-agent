'use client';
import { useRef, useState } from 'react';
import { useWikiQuery, useCreateWikiPage } from '@/lib/api';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { MarkdownBody } from './MarkdownBody';

// S07 query 对话框（spec §5.3）
// 弹出 modal：输入问题 → LLM 合成答案 + 引用 → 可"存为 wiki 页"
// DS3：projectId 限定当前 wiki 根
export function WikiQueryDialog({
  onClose,
  projectId,
}: {
  onClose: () => void;
  projectId?: string | null;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [question, setQuestion] = useState('');
  // B5：跨项目检索开关（缺省关；开 = 合并 global + 所有有效 project 根的 wiki）
  const [acrossRoots, setAcrossRoots] = useState(false);
  const [result, setResult] = useState<{
    answer: string;
    citations: { slug: string; title: string; root?: string }[];
  } | null>(null);
  const query = useWikiQuery(projectId, acrossRoots ? 'all' : undefined);
  const createPage = useCreateWikiPage(projectId);

  useFocusTrap(true, dialogRef, {
    onEscape: onClose,
    restoreFocus: true,
    autoFocus: true,
  });

  function handleSubmit() {
    if (!question.trim()) return;
    query.mutate(question, {
      onSuccess: (data) => setResult(data),
    });
  }

  function handleSave() {
    if (!result) return;
    // 从答案 markdown 提取标题（首行 # ）
    const titleMatch = result.answer.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `问答结果 ${new Date().toLocaleString('zh-CN')}`;
    createPage.mutate(
      { title, content: result.answer },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Wiki 问答"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Wiki 问答</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="wiki-query-input-row">
            <input
              type="text"
              className="wiki-query-input"
              data-autofocus
              placeholder="输入你的问题..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={query.isPending}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={query.isPending || !question.trim()}
            >
              {query.isPending ? '查询中…' : '提问'}
            </button>
          </div>
          <label className="wiki-query-cross-root">
            <input
              type="checkbox"
              checked={acrossRoots}
              onChange={(e) => setAcrossRoots(e.target.checked)}
              data-testid="wiki-query-cross-root"
            />
            跨项目检索（合并全局与所有项目根的 wiki）
          </label>

          {query.isError && (
            <div className="wiki-query-error">
              查询失败：{query.error.message}（检查 WIKI_LLM_API_KEY 是否配置）
            </div>
          )}

          {createPage.isError && (
            <div className="wiki-query-error">
              保存失败：{createPage.error.message}
            </div>
          )}

          {result && (
            <div className="wiki-query-result">
              <div className="wiki-query-answer">
                <MarkdownBody source={result.answer} />
              </div>
              {result.citations.length > 0 && (
                <div className="wiki-query-citations">
                  <strong>引用来源：</strong>
                  {result.citations.map((c) => (
                    // B5：跨根同 slug 会冲突，key 带根名区分；引用标签带根名提示
                    <span key={`${c.root ?? ''}:${c.slug}`} className="citation-tag">
                      {c.title}
                      {c.root ? ` · ${c.root}` : ''}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={handleSave}
                disabled={createPage.isPending}
              >
                {createPage.isPending ? '保存中…' : '存为 wiki 页'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
