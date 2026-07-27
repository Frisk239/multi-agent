'use client';

import type { SelectHTMLAttributes } from 'react';

/**
 * 共用原生 select 壳：统一 class / focus 手感，避免各处裸 select 样式漂移。
 * Slice 40（U7）— 不重做 combobox，仅收口外观与透传 props。
 */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = '', children, ...rest }: SelectProps) {
  return (
    <select
      className={['ma-select', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </select>
  );
}
