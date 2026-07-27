'use client';

import { create } from 'zustand';

export type ConfirmVariant = 'default' | 'danger';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** 仅展示确认（信息闸），取消文案仍可关 */
  hideCancel?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

type ConfirmState = {
  pending: PendingConfirm | null;
  request: (opts: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
};

/**
 * 全局二次确认队列（单 pending）。
 * 组件化 ConfirmDialog 消费；业务侧用 `confirmDialog()` / `useConfirm()`。
 */
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  request: (opts) =>
    new Promise<boolean>((resolve) => {
      const prev = get().pending;
      // 叠栈时先拒绝旧的，避免悬挂 Promise
      if (prev) prev.resolve(false);
      set({
        pending: {
          title: opts.title,
          description: opts.description,
          confirmLabel: opts.confirmLabel ?? '确认',
          cancelLabel: opts.cancelLabel ?? '取消',
          variant: opts.variant ?? 'default',
          hideCancel: opts.hideCancel ?? false,
          resolve,
        },
      });
    }),
  settle: (ok) => {
    const p = get().pending;
    if (!p) return;
    set({ pending: null });
    p.resolve(ok);
  },
}));

/** 命令式确认（不依赖 React hook） */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().request(opts);
}

export function useConfirm() {
  const request = useConfirmStore((s) => s.request);
  return request;
}
