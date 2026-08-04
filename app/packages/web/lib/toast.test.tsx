import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider, toastSuccess, toastError, enqueueToast, MAX_TOASTS } from './toast';

/**
 * G7-8 Toast 堆叠上限 + hover 暂停 + 关闭钮分离
 * - enqueueToast 纯函数：超过 MAX_TOASTS 挤掉最旧
 * - 组件：5 条连发只渲染 4 条，最旧被挤掉
 * - hover 暂停：悬停期间到点不消失，移出后按剩余时间消失
 * - action 与关闭钮分离：消息体不点击关闭，独立 × 关闭
 */

function Harness() {
  return (
    <ToastProvider>
      <div>
        <button type="button" onClick={() => toastSuccess('ok')}>
          push-ok
        </button>
        <button
          type="button"
          onClick={() => toastError('boom', { action: { label: '去处理', href: '/settings' } })}
        >
          push-error-action
        </button>
      </div>
    </ToastProvider>
  );
}

describe('enqueueToast', () => {
  it('appends normally under the cap', () => {
    const list = enqueueToast([{ id: 1 }, { id: 2 }], { id: 3 });
    expect(list.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('drops the oldest past the cap', () => {
    let list: { id: number }[] = [];
    for (let i = 1; i <= MAX_TOASTS + 2; i++) {
      list = enqueueToast(list, { id: i });
    }
    expect(list).toHaveLength(MAX_TOASTS);
    expect(list.map((t) => t.id)).toEqual([3, 4, 5, 6]);
  });
});

describe('ToastProvider (G7-8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('caps stacked toasts at MAX_TOASTS, dropping the oldest', () => {
    render(<Harness />);
    for (let i = 0; i < MAX_TOASTS + 2; i++) {
      act(() => {
        toastSuccess(`m${i}`);
      });
    }
    const toasts = document.querySelectorAll('.toast');
    expect(toasts.length).toBe(MAX_TOASTS);
    expect(toasts[0].textContent).toContain('m2'); // m0/m1 已被挤掉
    expect(screen.queryByText('m0')).toBeNull();
  });

  it('pauses countdown while hovered and resumes after leave', () => {
    render(<Harness />);
    act(() => {
      toastSuccess('slow', { durationMs: 1000 });
    });
    const toast = document.querySelector('.toast') as HTMLElement;
    expect(toast).toBeTruthy();

    // 悬停 → 到点不消失
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.querySelector('.toast')).toBeTruthy();

    // 移出 → 剩余时间到后消失（fake timers 下 Date.now 同步前进）
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(document.querySelector('.toast')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('separates close button from message body and action', () => {
    render(<Harness />);
    act(() => {
      toastError('boom', { action: { label: '去处理', href: '/settings' } });
    });
    // action 是链接，消息体不是按钮，关闭是独立 ×
    expect(screen.getByRole('link', { name: '去处理' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /boom/ })).toBeNull();
    const close = screen.getByRole('button', { name: '关闭提示' });
    expect(close).toBeTruthy();
    fireEvent.click(close);
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('dismisses after durationMs without interaction', () => {
    render(<Harness />);
    act(() => {
      toastSuccess('gone', { durationMs: 500 });
    });
    act(() => {
      vi.advanceTimersByTime(501);
    });
    expect(screen.queryByText('gone')).toBeNull();
  });
});
