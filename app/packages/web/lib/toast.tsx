'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = 'success' | 'warning' | 'error';

type ToastAction = {
  label: string;
  href: string;
};

type ToastOptions = {
  action?: ToastAction;
  /** 默认 3200；带 action 时略长 */
  durationMs?: number;
};

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
};

type ToastApi = {
  success: (message: string, opts?: ToastOptions) => void;
  warning: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let idSeq = 0;
let externalApi: ToastApi | null = null;

/** G7-8：堆叠上限——超过 max 挤掉最旧（纯函数，可单测） */
export const MAX_TOASTS = 4;

export function enqueueToast<T extends { id: number }>(
  list: T[],
  item: T,
  max: number = MAX_TOASTS,
): T[] {
  const next = [...list, item];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function toastSuccess(message: string, opts?: ToastOptions) {
  externalApi?.success(message, opts);
}

export function toastWarning(message: string, opts?: ToastOptions) {
  externalApi?.warning(message, opts);
}

export function toastError(message: string, opts?: ToastOptions) {
  externalApi?.error(message, opts);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // G7-8：计时器 / 截止时间 / 悬停暂停集，避免重渲染打断倒计时
  const timersRef = useRef(new Map<number, number>());
  const deadlinesRef = useRef(new Map<number, number>());
  const pausedRef = useRef(new Set<number>());
  /** 暂停时冻结的剩余毫秒（悬停 = 倒计时完全冻结） */
  const remainingRef = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    deadlinesRef.current.delete(id);
    pausedRef.current.delete(id);
    remainingRef.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, ms: number) => {
      const prev = timersRef.current.get(id);
      if (prev) window.clearTimeout(prev);
      deadlinesRef.current.set(id, Date.now() + ms);
      timersRef.current.set(
        id,
        window.setTimeout(() => {
          timersRef.current.delete(id);
          // hover 暂停：到点仍被悬停 → 延期，移出后按剩余时间重排
          if (pausedRef.current.has(id)) {
            const remaining = (deadlinesRef.current.get(id) ?? Date.now()) - Date.now();
            scheduleDismiss(id, Math.max(remaining, 200));
            return;
          }
          dismiss(id);
        }, ms),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (kind: ToastKind, message: string, opts?: ToastOptions) => {
      const id = ++idSeq;
      const action = opts?.action;
      setItems((prev) => {
        const next = enqueueToast(prev, { id, kind, message, action });
        // 被挤掉的最旧 toast：清掉其计时器，避免已消失的 toast 再次触发 dismiss
        for (const old of prev) {
          if (!next.some((x) => x.id === old.id)) {
            const t = timersRef.current.get(old.id);
            if (t) {
              window.clearTimeout(t);
              timersRef.current.delete(old.id);
            }
            deadlinesRef.current.delete(old.id);
            pausedRef.current.delete(old.id);
            remainingRef.current.delete(old.id);
          }
        }
        return next;
      });
      const ms = opts?.durationMs ?? (action ? 6000 : 3200);
      scheduleDismiss(id, ms);
    },
    [scheduleDismiss],
  );

  // G7-8：hover 暂停——悬停冻结剩余时间并清计时器，移出按冻结值续倒
  const pauseToast = useCallback((id: number) => {
    if (pausedRef.current.has(id)) return;
    pausedRef.current.add(id);
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    const deadline = deadlinesRef.current.get(id);
    if (deadline != null) {
      remainingRef.current.set(id, Math.max(deadline - Date.now(), 0));
    }
  }, []);

  const resumeToast = useCallback(
    (id: number) => {
      if (!pausedRef.current.has(id)) return;
      pausedRef.current.delete(id);
      const remaining = remainingRef.current.get(id);
      remainingRef.current.delete(id);
      if (remaining == null) return;
      if (remaining <= 0) {
        dismiss(id);
        return;
      }
      scheduleDismiss(id, remaining);
    },
    [dismiss, scheduleDismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, opts) => push('success', message, opts),
      warning: (message, opts) => push('warning', message, opts),
      error: (message, opts) => push('error', message, opts),
    }),
    [push],
  );

  useEffect(() => {
    externalApi = api;
    return () => {
      if (externalApi === api) externalApi = null;
    };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.kind}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => pauseToast(t.id)}
            onMouseLeave={() => resumeToast(t.id)}
          >
            <div className="toast-message">{t.message}</div>
            {t.action ? (
              <Link
                href={t.action.href}
                className="toast-action"
                onClick={() => dismiss(t.id)}
              >
                {t.action.label}
              </Link>
            ) : null}
            <button
              type="button"
              className="toast-close"
              aria-label="关闭提示"
              data-testid="toast-close"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      success: toastSuccess,
      warning: toastWarning,
      error: toastError,
    };
  }
  return ctx;
}
