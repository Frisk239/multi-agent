'use client';

import type { ReactNode } from 'react';

/**
 * Multica 集合页顶栏：主 CTA 独占；次要运维/跨页链收到「更多」。
 * 原生 details，无额外依赖；点菜单项后自动收起。
 */
export function PageHeaderMore({
  children,
  label = '更多',
  testId = 'page-header-more',
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  return (
    <details className="page-header-more" data-testid={testId}>
      <summary className="btn btn-ghost btn-sm page-header-more-summary">{label}</summary>
      <div
        className="page-header-more-menu"
        role="menu"
        onClick={(e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          if (t.closest('a,button')) {
            const root = e.currentTarget.closest('details');
            if (root) root.open = false;
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}
