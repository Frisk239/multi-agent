'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { classifyWikiIngestFailure, type WikiIngestJob } from '@ma/shared';
import { useRetryWikiJob, useSettingsStatus, useWikiJobs } from '@/lib/api';

type StatusFilter = '' | 'dead' | 'pending' | 'running' | 'completed' | 'failed';

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return new Date(iso).toLocaleString();
}

function JobRetryButton({ job }: { job: WikiIngestJob }) {
  const retry = useRetryWikiJob();
  if (job.status !== 'dead') return <span className="text-dim">—</span>;
  return (
    <button
      type="button"
      className="btn-primary btn-sm"
      disabled={retry.isPending}
      onClick={() => retry.mutate(job.id)}
    >
      {retry.isPending ? '排队中…' : '重试'}
    </button>
  );
}

export function WikiJobsPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawStatus = searchParams.get('jobStatus');
  const status: StatusFilter =
    rawStatus === 'pending' ||
    rawStatus === 'running' ||
    rawStatus === 'completed' ||
    rawStatus === 'failed' ||
    rawStatus === 'dead' ||
    rawStatus === 'all'
      ? (rawStatus === 'all' ? '' : rawStatus)
      : 'dead';

  function setStatus(next: StatusFilter) {
    const sp = new URLSearchParams(searchParams.toString());
    if (!next) sp.set('jobStatus', 'all');
    else sp.set('jobStatus', next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }


  const { data: settings } = useSettingsStatus();
  const { data: jobs, isLoading, isError, error, refetch, isFetching } = useWikiJobs(
    status || undefined,
  );
  const { data: deadJobs } = useWikiJobs('dead');

  const sorted = useMemo(() => {
    const list = jobs ? [...jobs] : [];
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [jobs]);

  const deadCount = deadJobs?.length ?? 0;
  const wikiLlmOk = settings?.secrets.wikiLlmConfigured ?? true;
  const showBanner = !wikiLlmOk || deadCount > 0;

  return (
    <div className="wiki-jobs-panel">
      {showBanner ? (
        <div className="wiki-ops-banner" role="status">
          <div className="wiki-ops-banner-main">
            <strong>
              {!wikiLlmOk
                ? 'Wiki LLM 未就绪'
                : `有 ${deadCount} 条编译任务失败（dead）`}
            </strong>
            <p className="text-sm">
              {!wikiLlmOk
                ? 'Issue 完成后的 Wiki 编译需要 WIKI_LLM_API_KEY。配置后可对 dead job 点「重试」，无需把 Issue 再拖一遍 Done。'
                : '查看下方错误摘要；修好环境后点「重试」重新排队编译。'}
            </p>
          </div>
          <Link href="/settings" className="btn-secondary btn-sm">
            打开设置
          </Link>
        </div>
      ) : null}

      <div className="wiki-jobs-header">
        <div className="wiki-jobs-title">
          编译任务 <span className="count">{sorted.length}</span>
          {deadCount > 0 ? (
            <span className="wiki-jobs-dead-pill" title="dead 数量（全量）">
              dead {deadCount}
            </span>
          ) : null}
        </div>
        <div className="wiki-jobs-toolbar">
          <label>
            状态
            <select
              value={status}
              data-testid="wiki-jobs-status-filter"
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="筛选 job 状态"
            >
              <option value="dead">dead</option>
              <option value="pending">pending</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="">全部</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            刷新
          </button>
        </div>
      </div>

      {status && status !== 'dead' ? (
        <div className="wiki-jobs-active-filters" data-testid="wiki-jobs-active-filters">
          <button
            type="button"
            className="kanban-active-chip"
            data-testid="wiki-jobs-chip-status"
            onClick={() => setStatus('dead')}
          >
            状态 · {status || '全部'} ×
          </button>
          <button
            type="button"
            className="kanban-active-chip kanban-active-chip--clear"
            data-testid="wiki-jobs-chip-clear"
            onClick={() => setStatus('dead')}
          >
            重置为 dead
          </button>
        </div>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table" data-testid="wiki-jobs-table">
          <thead>
            <tr>
              <th>状态</th>
              <th>Issue</th>
              <th>失败</th>
              <th>错误 / 提示</th>
              <th>更新</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="text-dim" style={{ textAlign: 'center' }}>
                  加载中…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={6} className="text-dim" style={{ textAlign: 'center' }}>
                  {error instanceof Error ? error.message : '加载 jobs 失败'}
                </td>
              </tr>
            )}
            {!isLoading &&
              !isError &&
              sorted.map((job) => {
                const failure =
                  job.status === 'dead' || job.lastError
                    ? classifyWikiIngestFailure(job.lastError)
                    : null;
                return (
                  <tr key={job.id}>
                    <td>
                      <code>{job.status}</code>
                    </td>
                    <td>
                      <Link href={`/issues/${job.issueId}`} title={job.issueId}>
                        {shortId(job.issueId)}
                      </Link>
                    </td>
                    <td className="text-dim text-sm">
                      {job.failCount}/{job.maxRetries}
                    </td>
                    <td>
                      {failure ? (
                        <div className="wiki-job-error">
                          <strong className="text-sm">{failure.title}</strong>
                          <div className="text-dim text-sm">{failure.hint}</div>
                          {job.lastError ? (
                            <pre className="wiki-job-error-pre">{job.lastError}</pre>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="text-dim text-sm" title={job.updatedAt}>
                      {relativeTime(job.updatedAt)}
                    </td>
                    <td>
                      <JobRetryButton job={job} />
                    </td>
                  </tr>
                );
              })}
            {!isLoading && !isError && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-dim" style={{ textAlign: 'center' }}>
                  <div data-testid="wiki-jobs-empty">
                    <div>
                      {status === 'dead'
                        ? '没有 dead 任务。Issue 拖到 Done 后若编译失败会出现在此。'
                        : '暂无匹配的编译任务'}
                    </div>
                    {status && status !== 'dead' ? (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          data-testid="wiki-jobs-clear-status"
                          onClick={() => setStatus('dead')}
                        >
                          回到 dead
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
