import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubagentTreeViewer } from './SubagentTreeViewer';

const treeState = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  useRunTree: () => treeState,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('SubagentTreeViewer honesty', () => {
  beforeEach(() => {
    treeState.data = undefined;
    treeState.isLoading = false;
    treeState.isError = false;
    treeState.refetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows ErrorState and retry when the tree request fails', () => {
    treeState.isError = true;
    render(<SubagentTreeViewer runId="run-1" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('子代理树加载失败')).toBeTruthy();
    fireEvent.click(screen.getByText('重试'));
    expect(treeState.refetch).toHaveBeenCalled();
  });

  it('shows empty copy when there is no tree', () => {
    render(<SubagentTreeViewer runId="run-1" />);
    expect(screen.getByTestId('subagent-tree-empty')).toHaveTextContent('暂无子代理');
  });
});
