'use client';
import { useWikiHealth, useWikiLint } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';

// S07 health + lint 面板（spec §5.4）
// 结构检查（零 LLM，瞬时）+ 语义检查（LLM，异步）
// onSelectPage：点击「跳转」定位到左侧列表对应页（spec §6.3）
export function WikiHealthPanel({
  onSelectPage,
}: {
  onSelectPage?: (slug: string) => void;
}) {
  const health = useWikiHealth();
  const lint = useWikiLint();

  return (
    <div className="wiki-health-panel">
      <div className="wiki-health-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
        >
          {health.isFetching ? '检查中…' : '结构检查'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => lint.mutate()}
          disabled={lint.isPending}
        >
          {lint.isPending ? '语义检查中…' : '语义检查'}
        </button>
      </div>

      {health.isError && (
        <div className="wiki-query-error">
          结构检查失败：{health.error.message}
        </div>
      )}

      {/* 结构检查结果 */}
      {health.data && (
        <div className="wiki-health-result">
          <div className="wiki-health-summary">
            总页数: {health.data.total} · 孤儿: {health.data.orphans.length} · 断链:{' '}
            {health.data.brokenLinks.length} · 空短: {health.data.stubs.length}
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>页面</th>
                  <th>详情</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {health.data.orphans.map((o) => (
                  <tr key={`orphan-${o.slug}`}>
                    <td>
                      <span className="health-pill health-pill-red">🔴 孤儿</span>
                    </td>
                    <td>{o.title}</td>
                    <td className="text-dim">0 入链</td>
                    <td>
                      {onSelectPage && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => onSelectPage(o.slug)}
                        >
                          跳转
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {health.data.brokenLinks.map((b, i) => (
                  <tr key={`broken-${i}`}>
                    <td>
                      <span className="health-pill health-pill-red">🔴 断链</span>
                    </td>
                    <td>{b.from}</td>
                    <td className="text-dim">→ {b.to}（不存在）</td>
                    <td>
                      {onSelectPage && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => onSelectPage(b.from)}
                        >
                          跳转
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {health.data.stubs.map((s) => (
                  <tr key={`stub-${s.slug}`}>
                    <td>
                      <span className="health-pill health-pill-yellow">🟡 空短</span>
                    </td>
                    <td>{s.title}</td>
                    <td className="text-dim">{s.bodyChars} 字</td>
                    <td>
                      {onSelectPage && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => onSelectPage(s.slug)}
                        >
                          跳转
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {health.data.orphans.length === 0 &&
                  health.data.brokenLinks.length === 0 &&
                  health.data.stubs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-dim" style={{ textAlign: 'center' }}>
                        <span className="health-pill health-pill-green">✅ 全部健康</span>
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 语义检查报告 */}
      {lint.data && (
        <div className="wiki-lint-result">
          <div className="wiki-lint-header">
            语义检查报告（检查了 {lint.data.checkedPages.length} 页）
          </div>
          <MarkdownBody source={lint.data.report} />
        </div>
      )}
      {lint.isError && (
        <div className="wiki-query-error">
          语义检查失败：{lint.error.message}（检查 WIKI_LLM_API_KEY 是否配置）
        </div>
      )}
    </div>
  );
}
