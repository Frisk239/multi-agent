'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateWikiPage, useProjects } from '@/lib/api';
import { Icon } from './Icon';
import { PageSkeleton } from './Skeleton';
import { Select } from './Select';

/**
 * /wiki/new —— 手动新建 Wiki 页。
 * IssueDetail「沉淀至 Wiki」CTA 链接到本页：?title= & issueId= & projectId= 预填。
 * 纯前端 + 复用 POST /api/wiki/pages（useCreateWikiPage，可选 projectId 根）。
 */
function WikiNewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTitle = searchParams.get('title') ?? '';
  const issueId = searchParams.get('issueId') ?? '';
  const initialProjectId = searchParams.get('projectId') ?? '';

  const [title, setTitle] = useState(initialTitle);
  const [projectId, setProjectId] = useState(initialProjectId);
  // 从 Issue 沉淀时预置一条回链，保留来源上下文（后端只收 title/content，零改动）
  const [content, setContent] = useState(() =>
    issueId
      ? `> 沉淀自 Issue：[${initialTitle || `/issues/${issueId}`}](/issues/${issueId})\n\n`
      : '',
  );

  const { data: projects = [] } = useProjects();
  const createPage = useCreateWikiPage(projectId || null);

  const canSubmit =
    title.trim().length > 0 && content.trim().length > 0 && !createPage.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    createPage.mutate(
      { title: title.trim(), content: content.trim() },
      {
        onSuccess: (page) => {
          const sp = new URLSearchParams();
          sp.set('slug', page.slug);
          if (projectId) sp.set('projectId', projectId);
          router.push(`/wiki?${sp.toString()}`);
        },
      },
    );
  }

  const projectHint = useMemo(
    () => (projectId ? projects.find((p) => p.id === projectId)?.title : ''),
    [projectId, projects],
  );

  return (
    <div className="page-container" data-testid="wiki-new-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Icon name="wiki" size={16} className="page-header-icon" />
            新建 Wiki 页
          </div>
          <p className="page-desc page-desc--quiet">
            手动沉淀一篇 Markdown 笔记；保存后可在 Wiki 中按 slug 访问。绑项目的页写入该仓
            localPath/wiki。
          </p>
        </div>
        <div className="page-actions">
          <Link href="/wiki" className="btn-ghost btn-sm" data-testid="wiki-new-back">
            ← 返回 Wiki
          </Link>
        </div>
      </div>

      <form
        className="wiki-new-form"
        data-testid="wiki-new-form"
        onSubmit={handleSubmit}
      >
        <label className="wiki-new-field">
          <span className="wiki-new-field-label">标题</span>
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：修复登录态过期的排查记录"
            data-testid="wiki-new-title"
            aria-label="Wiki 页标题"
          />
        </label>

        <label className="wiki-new-field">
          <span className="wiki-new-field-label">项目根</span>
          <Select
            className="new-issue-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Wiki 项目根"
            data-testid="wiki-new-project"
          >
            <option value="">全局 Wiki</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
          {projectHint ? (
            <span className="text-dim text-sm" data-testid="wiki-new-project-hint">
              保存后跳转至 {projectHint} 的 Wiki
            </span>
          ) : null}
        </label>

        <label className="wiki-new-field">
          <span className="wiki-new-field-label">正文（Markdown）</span>
          <textarea
            className="ops-textarea"
            rows={16}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={'支持 Markdown：标题、列表、代码块、链接…\n\n例如：\n# 问题现象\n## 根因分析\n## 解决方案'}
            data-testid="wiki-new-content"
            aria-label="Wiki 页正文"
          />
        </label>

        {createPage.isError ? (
          <div
            className="wiki-query-error"
            role="alert"
            data-testid="wiki-new-error"
          >
            保存失败：{createPage.error?.message ?? '未知错误'}
          </div>
        ) : null}

        <div className="ops-form-actions">
          <button
            type="submit"
            className="btn-primary"
            data-testid="wiki-new-submit"
            disabled={!canSubmit}
          >
            {createPage.isPending ? '保存中…' : '发布页面'}
          </button>
          <Link
            href="/wiki"
            className="btn-ghost"
            data-testid="wiki-new-cancel"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}

export function WikiNewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WikiNewPageInner />
    </Suspense>
  );
}
