'use client';

import { useState, useEffect } from 'react';
import type { Issue } from '@ma/shared';
import { useUpdateIssue } from '@/lib/api';
import { toastSuccess, toastError } from '@/lib/toast';

export interface ParsedPrInfo {
  type: 'github_pr' | 'gitlab_mr' | 'git_branch' | 'generic_url';
  label: string;
  subLabel?: string;
  fullUrl: string;
  isHttpUrl: boolean;
  status: 'open' | 'merged' | 'draft' | 'linked_branch';
  statusLabel: string;
}

export function parsePrInfo(rawUrl: string): ParsedPrInfo {
  const trimmed = rawUrl.trim();
  const isHttp = /^https?:\/\//i.test(trimmed);

  if (isHttp) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase();
      const pathname = url.pathname;

      // GitHub PR: /owner/repo/pull/123
      const ghMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
      if (host.includes('github.com') && ghMatch) {
        const [, owner, repo, prNum] = ghMatch;
        let status: 'open' | 'merged' | 'draft' | 'linked_branch' = 'open';
        let statusLabel = 'Open';

        if (url.hash.includes('merged') || url.searchParams.get('state') === 'merged' || pathname.includes('/merged')) {
          status = 'merged';
          statusLabel = 'Merged';
        } else if (url.hash.includes('draft') || url.searchParams.get('state') === 'draft' || pathname.includes('/draft')) {
          status = 'draft';
          statusLabel = 'Draft';
        }

        return {
          type: 'github_pr',
          label: `#${prNum}`,
          subLabel: `${owner}/${repo}`,
          fullUrl: trimmed,
          isHttpUrl: true,
          status,
          statusLabel,
        };
      }

      // GitLab MR: /owner/repo/-/merge_requests/45
      const glMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/-\/merge_requests\/(\d+)/i);
      if (host.includes('gitlab.com') && glMatch) {
        const [, owner, repo, mrNum] = glMatch;
        let status: 'open' | 'merged' | 'draft' | 'linked_branch' = 'open';
        let statusLabel = 'Open';

        if (url.hash.includes('merged') || pathname.includes('/merged')) {
          status = 'merged';
          statusLabel = 'Merged';
        } else if (url.hash.includes('draft') || pathname.includes('/draft')) {
          status = 'draft';
          statusLabel = 'Draft';
        }

        return {
          type: 'gitlab_mr',
          label: `!${mrNum}`,
          subLabel: `${owner}/${repo}`,
          fullUrl: trimmed,
          isHttpUrl: true,
          status,
          statusLabel,
        };
      }

      // GitHub Branch URL: /owner/repo/tree/branch-name
      const ghBranchMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/tree\/(.+)/i);
      if (host.includes('github.com') && ghBranchMatch) {
        const [, owner, repo, branch] = ghBranchMatch;
        return {
          type: 'git_branch',
          label: branch,
          subLabel: `${owner}/${repo}`,
          fullUrl: trimmed,
          isHttpUrl: true,
          status: 'linked_branch',
          statusLabel: 'Linked Branch',
        };
      }

      // Generic URL fallback
      const shortPath = pathname.length > 25 ? pathname.slice(0, 22) + '...' : pathname;
      return {
        type: 'generic_url',
        label: shortPath || url.hostname,
        subLabel: url.hostname,
        fullUrl: trimmed,
        isHttpUrl: true,
        status: 'linked_branch',
        statusLabel: 'Linked',
      };
    } catch {
      // Fall through
    }
  }

  // Raw Branch Name
  return {
    type: 'git_branch',
    label: trimmed,
    subLabel: 'Git Branch',
    fullUrl: trimmed,
    isHttpUrl: false,
    status: 'linked_branch',
    statusLabel: 'Linked Branch',
  };
}

export function IssuePrCard({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();
  const [modalOpen, setModalOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(issue.prUrl ?? '');

  useEffect(() => {
    if (!modalOpen) {
      setDraftUrl(issue.prUrl ?? '');
    }
  }, [issue.prUrl, modalOpen]);

  const handleBindSave = () => {
    const next = draftUrl.trim();
    const prev = (issue.prUrl ?? '').trim();
    if (next === prev) {
      setModalOpen(false);
      return;
    }

    update.mutate(
      { id: issue.id, input: { prUrl: next ? next : null } },
      {
        onSuccess: () => {
          toastSuccess(next ? '关联 Pull Request 成功' : '解绑 PR 成功');
          setModalOpen(false);
        },
        onError: (err: any) => {
          toastError(err.message || '更新失败');
        },
      }
    );
  };

  const handleUnbind = () => {
    update.mutate(
      { id: issue.id, input: { prUrl: null } },
      {
        onSuccess: () => {
          toastSuccess('已解绑 PR / 分支');
          setModalOpen(false);
        },
        onError: (err: any) => {
          toastError(err.message || '解绑失败');
        },
      }
    );
  };

  const parsed = issue.prUrl ? parsePrInfo(issue.prUrl) : null;

  return (
    <div
      className="issue-pr-card issue-props-card mt-4 p-4 border border-slate-200 rounded-lg shadow-sm bg-white text-sm"
      data-testid="issue-pr-card"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span>关联拉取请求 (PR)</span>
        </div>
      </div>

      {!parsed ? (
        <div className="py-1" data-testid="issue-pr-unbound">
          <button
            type="button"
            className="w-full py-2 px-3 border border-dashed border-slate-300 rounded-md text-slate-600 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium"
            data-testid="issue-pr-bind-btn"
            onClick={() => setModalOpen(true)}
          >
            <span className="text-base font-bold">+</span> 绑定 Pull Request / 分支
          </button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="issue-pr-bound">
          {/* PR Pill Badge & Status Indicator */}
          <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="flex items-center gap-2 min-w-0" data-testid="issue-pr-pill">
              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-mono text-xs font-semibold flex-shrink-0">
                {parsed.type === 'github_pr' ? 'GitHub PR' : parsed.type === 'gitlab_mr' ? 'GitLab MR' : 'Git Branch'}
              </span>
              <div className="min-w-0 flex flex-col">
                <span className="font-semibold text-slate-800 truncate" title={parsed.label}>
                  {parsed.label}
                </span>
                {parsed.subLabel && (
                  <span className="text-xs text-slate-500 truncate" title={parsed.subLabel}>
                    {parsed.subLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Status Indicator */}
            <div
              className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 flex-shrink-0 ${
                parsed.status === 'open'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : parsed.status === 'merged'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : parsed.status === 'draft'
                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
              data-testid="issue-pr-status-indicator"
              data-status={parsed.status}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  parsed.status === 'open'
                    ? 'bg-emerald-500'
                    : parsed.status === 'merged'
                    ? 'bg-purple-500'
                    : parsed.status === 'draft'
                    ? 'bg-slate-400'
                    : 'bg-blue-500'
                }`}
              />
              <span>{parsed.statusLabel}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {parsed.isHttpUrl ? (
              <a
                href={parsed.fullUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm flex-1 text-center justify-center flex items-center gap-1"
                data-testid="issue-pr-open-btn"
                title={parsed.fullUrl}
              >
                🔗 在 GitHub / Git 打开
              </a>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm flex-1 justify-center flex items-center gap-1"
                data-testid="issue-pr-open-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(parsed.fullUrl);
                  toastSuccess('已复制分支名称: ' + parsed.fullUrl);
                }}
                title={parsed.fullUrl}
              >
                🌿 Git 分支: {parsed.fullUrl}
              </button>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-sm text-slate-600"
              data-testid="issue-pr-edit-btn"
              onClick={() => setModalOpen(true)}
            >
              修改
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              data-testid="issue-pr-unbind-btn"
              disabled={update.isPending}
              onClick={handleUnbind}
            >
              解绑
            </button>
          </div>
        </div>
      )}

      {/* Modal / Popover */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          data-testid="issue-pr-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-800 text-base">
                {issue.prUrl ? '修改关联 Pull Request / 分支' : '绑定 Pull Request / 分支'}
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                onClick={() => setModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Pull Request 网址或 Git 分支名
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123 或 feature/branch-name"
                data-testid="issue-pr-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBindSave();
                  }
                  if (e.key === 'Escape') {
                    setModalOpen(false);
                  }
                }}
              />
              <p className="text-xs text-slate-500">
                支持输入 GitHub/GitLab 的 Pull Request / Merge Request 完整的 URL，或本地 Git 分支名。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="issue-pr-cancel"
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm bg-purple-600 hover:bg-purple-700 text-white"
                data-testid="issue-pr-save"
                disabled={update.isPending}
                onClick={handleBindSave}
              >
                保存绑定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
