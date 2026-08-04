'use client';

import { useEffect } from 'react';

/** 与 app/layout.tsx metadata.title 保持一致 */
export const BASE_TITLE = '毕设 Multi-Agent';

/**
 * G7-9：页面级 document.title（多标签可辨）。
 * 传 `issue 标题` / `run 短 id` 等拼接；null/undefined 回退基础标题。
 * 卸载时还原基础标题，避免跳到未接 hook 的页面时残留旧标题。
 */
export function usePageTitle(suffix: string | null | undefined) {
  useEffect(() => {
    document.title = suffix ? `${suffix} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [suffix]);
}
