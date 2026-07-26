'use client';

import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  icon?: string | ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state ${className}`.trim()} role="status">
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <p className="empty-state-title">{title}</p>
      {description ? <p className="empty-state-desc">{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
