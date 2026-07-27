import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { useWsStore } from '@/lib/ws';
import { WsConnectionBanner } from './WsConnectionBanner';

const toastSuccess = vi.fn();

vi.mock('@/lib/toast', () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: vi.fn(),
}));

describe('WsConnectionBanner', () => {
  beforeEach(() => {
    cleanup();
    toastSuccess.mockClear();
    useWsStore.setState({ status: 'connecting' });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows banner when connecting', () => {
    useWsStore.setState({ status: 'connecting' });
    render(<WsConnectionBanner />);
    const banner = screen.getByTestId('ws-connection-banner');
    expect(banner).toHaveAttribute('data-status', 'connecting');
    expect(screen.getByText('正在连接实时通道…')).toBeTruthy();
    expect(screen.getByTestId('ws-connection-refresh')).toBeTruthy();
  });

  it('shows banner when closed', () => {
    useWsStore.setState({ status: 'closed' });
    render(<WsConnectionBanner />);
    expect(screen.getByTestId('ws-connection-banner')).toHaveAttribute(
      'data-status',
      'closed',
    );
    expect(screen.getByText('实时连接已断开')).toBeTruthy();
  });

  it('hides when open', () => {
    useWsStore.setState({ status: 'open' });
    const { container } = render(<WsConnectionBanner />);
    expect(container.querySelector('[data-testid="ws-connection-banner"]')).toBeNull();
  });

  it('toasts once after recover from closed', () => {
    useWsStore.setState({ status: 'closed' });
    const { rerender } = render(<WsConnectionBanner />);
    expect(toastSuccess).not.toHaveBeenCalled();

    useWsStore.setState({ status: 'open' });
    rerender(<WsConnectionBanner />);
    expect(toastSuccess).toHaveBeenCalledWith('实时连接已恢复');

    toastSuccess.mockClear();
    useWsStore.setState({ status: 'open' });
    rerender(<WsConnectionBanner />);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('refresh button reloads page', () => {
    useWsStore.setState({ status: 'closed' });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<WsConnectionBanner />);
    fireEvent.click(screen.getByTestId('ws-connection-refresh'));
    expect(reload).toHaveBeenCalled();
  });
});
