'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 收集容器内可 Tab 聚焦的元素（纯函数，e2e 可镜像） */
export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      if (el.tabIndex < 0) return false;
      const style = window.getComputedStyle?.(el);
      if (style && (style.visibility === 'hidden' || style.display === 'none')) {
        return false;
      }
      return true;
    },
  );
}

/** Tab 循环索引（纯函数） */
export function cycleFocusIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

export type UseFocusTrapOptions = {
  /** Esc 时回调（关闭弹层） */
  onEscape?: () => void;
  /** 关闭后是否归还焦点到打开前元素，默认 true */
  restoreFocus?: boolean;
  /** 打开时是否自动聚焦第一个可聚焦元素，默认 true */
  autoFocus?: boolean;
};

/**
 * 轻量 focus trap：Tab 循环 + Esc + 关闭后归还焦点。
 * 挂在 dialog/form 容器 ref 上；active=false 时不监听。
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions = {},
): void {
  const { onEscape, restoreFocus = true, autoFocus = true } = options;
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    let autoFocusTimer: number | undefined;
    if (autoFocus) {
      autoFocusTimer = window.setTimeout(() => {
        const nodes = getFocusableElements(container);
        const preferred =
          container.querySelector<HTMLElement>('[data-autofocus]') ??
          nodes[0] ??
          container;
        preferred.focus?.();
      }, 0);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (onEscapeRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }

      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const nodes = getFocusableElements(root);
      if (nodes.length === 0) {
        e.preventDefault();
        root.focus?.();
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const idx = activeEl ? nodes.indexOf(activeEl) : -1;
      if (idx === -1) {
        e.preventDefault();
        (e.shiftKey ? nodes[nodes.length - 1] : nodes[0])?.focus();
        return;
      }

      if (!e.shiftKey && idx === nodes.length - 1) {
        e.preventDefault();
        nodes[0]?.focus();
        return;
      }
      if (e.shiftKey && idx === 0) {
        e.preventDefault();
        nodes[nodes.length - 1]?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (autoFocusTimer != null) window.clearTimeout(autoFocusTimer);
      if (restoreFocus) {
        const prev = previousFocusRef.current;
        previousFocusRef.current = null;
        try {
          prev?.focus?.();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref object identity stable
  }, [active, containerRef, restoreFocus, autoFocus]);
}
