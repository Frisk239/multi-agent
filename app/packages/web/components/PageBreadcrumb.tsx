'use client';

import Link from 'next/link';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

/**
 * Multica 详情顶栏：文字面包屑 + ›，无返回箭头。
 * 例：智能体 › 产品·策划队长 · Issues › FRI-67
 */
export function PageBreadcrumb({
  items,
  testId = 'page-breadcrumb',
}: {
  items: BreadcrumbItem[];
  testId?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav className="page-breadcrumb" aria-label="面包屑" data-testid={testId}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="page-breadcrumb-seg">
            {i > 0 ? (
              <span className="page-breadcrumb-sep" aria-hidden>
                ›
              </span>
            ) : null}
            {item.href && !isLast ? (
              <Link href={item.href} className="page-breadcrumb-link">
                {item.label}
              </Link>
            ) : item.href && isLast ? (
              <Link href={item.href} className="page-breadcrumb-current page-breadcrumb-link">
                {item.label}
              </Link>
            ) : (
              <span
                className={isLast ? 'page-breadcrumb-current' : 'page-breadcrumb-text'}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
