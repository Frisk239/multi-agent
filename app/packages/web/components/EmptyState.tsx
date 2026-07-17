'use client';

import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state ${className}`.trim()} role="status">
      <p className="empty-state-title">{title}</p>
      {description ? <p className="empty-state-desc">{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
