'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useSettingsStatus, useWikiHealth, useWikiLint } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';

function wikiShareHref(slug: string, projectId?: string | null): string {
  const sp = new URLSearchParams();
  sp.set('slug', slug);
  const pid = projectId?.trim();
  if (pid) sp.set('projectId', pid);
  return `/wiki?${sp.toString()}`;
}

// S07 health + lint 面板（spec §5.4）
// 结构检查（零 LLM，瞬时）+ 语义检查（LLM，异步）
// onSelectPage：点击「跳转」定位到左侧列表对应页（spec §6.3）
// DS3：projectId 限定当前 wiki 根
export function WikiHealthPanel({
  onSelectPage,
  projectId,
}: {
  onSelectPage?: (slug: string) => void;
  projectId?: string | null;
}) {
  const health = useWikiHealth(projectId);
  const lint = useWikiLint(projectId);
  const { data: settings } = useSettingsStatus();
  const autoRan = useRef(false);
  const lastRoot = useRef(projectId ?? '');

  // 进入 Wiki / 切换根 自动跑一次结构检查
  useEffect(() => {
    const root = projectId ?? '';
    if (autoRan.current && lastRoot.current === root) return;
    autoRan.current = true;
    lastRoot.current = root;
    void health.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 根切换触发
  }, [projectId]);

  const wikiLlmBlocked = useMemo(() => {
    const c = settings?.checks?.find((x) => x.id === 'wiki_llm');
    return c != null && c.status === 'error';
  }, [settings]);

  const issueCount = useMemo(() => {
    if (!health.data) return 0;
    return (
      health.data.orphans.length +
      health.data.brokenLinks.length +
      health.data.stubs.length
    );
  }, [health.data]);

  return (
    <div className="wiki-health-panel" data-testid="wiki-health-panel">
      {wikiLlmBlocked ? (
        <div className="wiki-ops-banner" data-testid="wiki-llm-banner" role="status">
          <div className="wiki-ops-banner-main">
            <strong>Wiki LLM 未就绪</strong>
            <p className="text-sm">
              语义检查 / 自动编译依赖 <code>WIKI_LLM_API_KEY</code>
              。结构检查仍可离线使用。
            </p>
          </div>
          <div className="wiki-ops-banner-actions" data-testid="wiki-llm-banner-actions">
            <Link href="/settings" className="btn-secondary btn-sm" data-testid="wiki-health-to-settings">
              环境诊断
            </Link>
            <Link
              href="/wiki?jobStatus=dead"
              className="btn-ghost btn-sm"
              data-testid="wiki-health-to-dead"
            >
              dead 任务
            </Link>
            <Link href="/memory" className="btn-ghost btn-sm" data-testid="wiki-health-to-memory">
              记忆
            </Link>
          </div>
        </div>
      ) : null}

      <div className="wiki-health-actions">
        <button
          type="button"
          className="btn-ghost"
          data-testid="wiki-health-run"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
        >
          {health.isFetching ? '检查中…' : health.data ? '重新结构检查' : '结构检查'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          data-testid="wiki-lint-run"
          onClick={() => lint.mutate()}
          disabled={lint.isPending || wikiLlmBlocked}
          title={wikiLlmBlocked ? '需要 WIKI_LLM_API_KEY' : undefined}
        >
          {lint.isPending ? '语义检查中…' : '语义检查'}
        </button>
        <Link
          href="/wiki?jobStatus=dead"
          className="btn-ghost btn-sm"
          data-testid="wiki-health-jobs-dead"
        >
          编译任务
        </Link>
        <Link href="/settings" className="btn-ghost btn-sm" data-testid="wiki-health-settings">
          设置
        </Link>
        {health.data ? (
          <span
            className={`wiki-health-badge${issueCount > 0 ? ' wiki-health-badge--warn' : ' wiki-health-badge--ok'}`}
            data-testid="wiki-health-badge"
            data-issues={issueCount}
          >
            {issueCount > 0 ? `${issueCount} 项待处理` : '结构健康'}
          </span>
        ) : null}
      </div>

      {health.isError && (
        <div className="wiki-query-error">
          结构检查失败：{health.error.message}
        </div>
      )}

      {/* 结构检查结果 */}
      {health.data && (
        <div className="wiki-health-result" data-testid="wiki-health-result">
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
                      {onSelectPage ? (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          data-testid="wiki-health-jump"
                          data-slug={o.slug}
                          onClick={() => onSelectPage(o.slug)}
                        >
                          跳转
                        </button>
                      ) : null}
                      <Link
                        href={wikiShareHref(o.slug, projectId)}
                        className="btn-ghost btn-sm"
                        data-testid="wiki-health-share"
                        data-slug={o.slug}
                      >
                        分享
                      </Link>
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
                      {onSelectPage ? (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          data-testid="wiki-health-jump"
                          data-slug={b.from}
                          onClick={() => onSelectPage(b.from)}
                        >
                          跳转
                        </button>
                      ) : null}
                      <Link
                        href={wikiShareHref(b.from, projectId)}
                        className="btn-ghost btn-sm"
                        data-testid="wiki-health-share"
                        data-slug={b.from}
                      >
                        分享
                      </Link>
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
                      {onSelectPage ? (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          data-testid="wiki-health-jump"
                          data-slug={s.slug}
                          onClick={() => onSelectPage(s.slug)}
                        >
                          跳转
                        </button>
                      ) : null}
                      <Link
                        href={wikiShareHref(s.slug, projectId)}
                        className="btn-ghost btn-sm"
                        data-testid="wiki-health-share"
                        data-slug={s.slug}
                      >
                        分享
                      </Link>
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
