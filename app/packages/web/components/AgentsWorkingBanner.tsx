'use client';

import Link from 'next/link';
import { useRunsActiveCount } from '@/lib/api';

/**
 * Multica Issues 顶栏「N 个智能体工作中」——看板/我的 issue 可见。
 * 数据源：active runs 去重 agentId。
 */
export function AgentsWorkingBanner() {
  const { data } = useRunsActiveCount();
  const n = data?.agentsWorking ?? 0;
  const runs = data?.count ?? 0;
  const hot = n > 0 || runs > 0;

  return (
    <div
      className={`agents-working-banner${hot ? ' agents-working-banner--hot' : ''}`}
      data-testid="agents-working-banner"
      data-count={String(n)}
      data-runs={String(runs)}
    >
      <span className="agents-working-dot" aria-hidden />
      <span className="agents-working-label">
        {n} 个智能体工作中
        {runs > 0 ? (
          <span className="agents-working-sub"> · {runs} 条在途 run</span>
        ) : null}
      </span>
      <span className="agents-working-actions">
        {runs > 0 ? (
          <Link
            href="/runs?status=active"
            className="agents-working-link"
            data-testid="agents-working-to-runs"
          >
            查看运行
          </Link>
        ) : (
          <Link href="/agents" className="agents-working-link" data-testid="agents-working-to-agents">
            智能体
          </Link>
        )}
      </span>
    </div>
  );
}
