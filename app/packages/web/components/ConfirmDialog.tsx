'use client';

import { useRef } from 'react';
import { useConfirmStore } from '@/lib/confirm-store';
import { useFocusTrap } from '@/lib/use-focus-trap';

/**
 * Slice 48 · 共用 ConfirmDialog
 * 标题/说明/确认取消 · Esc · focus trap · 危险变体
 */
export function ConfirmDialog() {
  const pending = useConfirmStore((s) => s.pending);
  const settle = useConfirmStore((s) => s.settle);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const open = Boolean(pending);

  useFocusTrap(open, dialogRef, {
    onEscape: () => settle(false),
    restoreFocus: true,
    autoFocus: true,
  });

  if (!pending) return null;

  const danger = pending.variant === 'danger';
  const confirmLabel = pending.confirmLabel ?? '确认';
  const cancelLabel = pending.cancelLabel ?? '取消';

  return (
    <div
      className="modal-overlay confirm-dialog-overlay"
      role="presentation"
      data-testid="confirm-dialog-overlay"
      onClick={() => settle(false)}
    >
      <div
        ref={dialogRef}
        className={`modal-dialog confirm-dialog${danger ? ' confirm-dialog--danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={
          pending.description ? 'confirm-dialog-desc' : undefined
        }
        tabIndex={-1}
        data-testid="confirm-dialog"
        data-variant={pending.variant ?? 'default'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header confirm-dialog-header">
          <h3 id="confirm-dialog-title" data-testid="confirm-dialog-title">
            {pending.title}
          </h3>
          <button
            type="button"
            className="modal-close"
            aria-label="关闭"
            data-testid="confirm-dialog-close"
            onClick={() => settle(false)}
          >
            ×
          </button>
        </div>
        {pending.description ? (
          <div
            className="modal-body confirm-dialog-body"
            id="confirm-dialog-desc"
            data-testid="confirm-dialog-description"
          >
            {pending.description.split('\n').map((line, i) => (
              <p key={i} className="confirm-dialog-line">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        <div className="confirm-dialog-footer" data-testid="confirm-dialog-footer">
          {!pending.hideCancel ? (
            <button
              type="button"
              className="btn-secondary"
              data-testid="confirm-dialog-cancel"
              onClick={() => settle(false)}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={danger ? 'btn-stop' : 'btn-primary'}
            data-testid="confirm-dialog-confirm"
            data-autofocus
            onClick={() => settle(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
