'use client';

import { useRef } from 'react';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { useShortcuts } from '@/lib/use-shortcuts';
import { getShortcutHelpGroups } from '@/lib/shortcuts';

export function KeyboardShortcutsModal() {
  const { isHelpOpen, closeHelp } = useShortcuts();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const SHORTCUTS = getShortcutHelpGroups();

  useFocusTrap(isHelpOpen, dialogRef, {
    onEscape: closeHelp,
    restoreFocus: true,
    autoFocus: true,
  });

  if (!isHelpOpen) return null;

  return (
    <div className="shortcuts-modal-overlay" onClick={closeHelp} role="presentation">
      <div
        ref={dialogRef}
        className="shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-label="键盘快捷键"
        data-testid="shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-header">
          <h2>键盘快捷键</h2>
          <button
            type="button"
            className="shortcuts-close"
            onClick={closeHelp}
            aria-label="关闭"
            data-autofocus
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="shortcuts-body">
          {SHORTCUTS.map((group) => (
            <div key={group.category} className="shortcuts-group">
              <h3>{group.category}</h3>
              <ul>
                {group.items.map((item, idx) => (
                  <li key={idx}>
                    <span>{item.label}</span>
                    <div className="shortcuts-keys">
                      {item.keys.map((k, i) => (
                        <kbd key={i}>{k}</kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .shortcuts-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          backdrop-filter: blur(4px);
        }
        .shortcuts-modal {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          box-shadow: var(--floating-shadow);
          overflow: hidden;
          animation: slideUp 0.2s ease-out;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .shortcuts-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
        }
        .shortcuts-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .shortcuts-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .shortcuts-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .shortcuts-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .shortcuts-group h3 {
          margin: 0 0 10px 0;
          font-size: 13px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .shortcuts-group ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .shortcuts-group li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 14px;
          color: var(--text-primary);
        }
        .shortcuts-keys {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        kbd {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-bottom-width: 2px;
          border-radius: 4px;
          padding: 2px 6px;
          font-family: inherit;
          font-size: 12px;
          color: var(--text-muted);
          min-width: 24px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
