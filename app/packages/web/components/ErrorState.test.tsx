import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  afterEach(() => {
    cleanup();
  });

  it('defaults to Chinese title and retry label', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('出了点问题')).toBeTruthy();
    const btn = screen.getByRole('button', { name: '重试' });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('allows overriding title and omits retry without onRetry', () => {
    render(<ErrorState title="加载失败" description="网络不可用" />);
    expect(screen.getByText('加载失败')).toBeTruthy();
    expect(screen.getByText('网络不可用')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });
});
