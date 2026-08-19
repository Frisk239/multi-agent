'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  makeListViewKey,
  readListViewState,
  saveListViewState,
  sessionStorageOrNull,
} from './issue-list-scroll-restore';

export function useListAnchor(opts: {
  page: string;
  filters: Record<string, string>;
  itemIds: readonly string[];
  attr: string;
  skip?: boolean;
}) {
  const key = useMemo(
    () => makeListViewKey({ page: opts.page, ...opts.filters }),
    [opts.page, opts.filters],
  );
  const [restoredId, setRestoredId] = useState<string | null>(null);

  const remember = useCallback(
    (id: string, index: number) => {
      saveListViewState(sessionStorageOrNull(), key, {
        pagesLoaded: 1,
        anchorIssueId: id,
        anchorIndex: index,
      });
    },
    [key],
  );

  useEffect(() => {
    if (opts.skip || opts.itemIds.length === 0) return;
    const saved = readListViewState(sessionStorageOrNull(), key);
    const id = saved?.anchorIssueId;
    if (!id || !opts.itemIds.includes(id)) return;
    setRestoredId(id);
    const el = document.querySelector(`[${opts.attr}="${id}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' });
  }, [opts.skip, opts.itemIds, key, opts.attr]);

  return { restoredId, remember };
}
