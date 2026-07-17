'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = 'success' | 'error';

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
  error: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let idSeq = 0;
let externalApi: ToastApi | null = null;

export function toastSuccess(message: string, opts?: ToastOptions) {
  externalApi?.success(message, opts);
}

export function toastError(message: string, opts?: ToastOptions) {
  externalApi?.error(message, opts);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string, opts?: ToastOptions) => {
    const id = ++idSeq;
    const action = opts?.action;
    setItems((prev) => [...prev, { id, kind, message, action }]);
    const ms = opts?.durationMs ?? (action ? 6000 : 3200);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, ms);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, opts) => push('success', message, opts),
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
          >
            <button
              type="button"
              className="toast-message"
              onClick={() => dismiss(t.id)}
            >
              {t.message}
            </button>
            {t.action ? (
              <Link
                href={t.action.href}
                className="toast-action"
                onClick={() => dismiss(t.id)}
              >
                {t.action.label}
              </Link>
            ) : null}
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
      error: toastError,
    };
  }
  return ctx;
}
