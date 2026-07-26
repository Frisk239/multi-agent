'use client';

import React from 'react';
import type { ReactNode } from 'react';

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className = '',
}: {
  title?: string;
  description?: string | ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`error-state ${className}`.trim()} role="alert">
      <div className="error-state-icon">⚠️</div>
      <p className="error-state-title">{title}</p>
      {description && <div className="error-state-desc">{description}</div>}
      {onRetry && (
        <button className="error-state-retry-btn" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}
