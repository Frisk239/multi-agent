import React from 'react';

export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
}: {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  lines?: number;
  className?: string;
}) {
  const baseStyle = { width, height };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`skeleton-wrapper ${className}`.trim()}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton skeleton-text"
            style={{
              width: i === lines - 1 ? '70%' : width || '100%',
              height,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`skeleton skeleton-${variant} ${className}`.trim()}
      style={baseStyle}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <Skeleton variant="rectangular" height={40} className="mb-4" />
      <Skeleton variant="text" lines={3} className="mb-8" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton variant="rectangular" height={120} />
        <Skeleton variant="rectangular" height={120} />
        <Skeleton variant="rectangular" height={120} />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-skeleton">
      <Skeleton variant="rectangular" height={40} className="mb-2" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={32} className="mb-2" />
      ))}
    </div>
  );
}
