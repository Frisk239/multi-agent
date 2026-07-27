import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
  IssueSideSheet,
  buildIssueSheetHref,
  withIssueSearchParam,
} from './IssueSideSheet';

vi.mock('./IssueDetail', () => ({
  IssueDetail: ({
    id,
    variant,
  }: {
    id: string;
    variant?: string;
  }) => (
    <div
      data-testid="issue-detail"
      data-issue-id={id}
      data-variant={variant ?? 'page'}
    >
      mock detail {id}
    </div>
  ),
}));

describe('withIssueSearchParam / buildIssueSheetHref', () => {
  it('sets and clears issue while preserving other params', () => {
    const withIssue = withIssueSearchParam('view=list&q=foo', 'abc-123');
    const sp = new URLSearchParams(withIssue);
    expect(sp.get('view')).toBe('list');
    expect(sp.get('q')).toBe('foo');
    expect(sp.get('issue')).toBe('abc-123');

    const cleared = withIssueSearchParam(withIssue, null);
    const sp2 = new URLSearchParams(cleared);
    expect(sp2.get('issue')).toBeNull();
    expect(sp2.get('view')).toBe('list');
  });

  it('builds shareable sheet href with optional hash', () => {
    expect(buildIssueSheetHref('/', 'view=list', 'id-1')).toBe(
      '/?view=list&issue=id-1',
    );
    expect(buildIssueSheetHref('/', '', 'id-2', '#run-trace')).toBe(
      '/?issue=id-2#run-trace',
    );
    expect(buildIssueSheetHref('/', 'q=x', 'id-3', 'run-trace')).toBe(
      '/?q=x&issue=id-3#run-trace',
    );
  });
});

describe('IssueSideSheet', () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when issueId is empty', () => {
    const { container } = render(
      <IssueSideSheet issueId={null} onClose={() => {}} />,
    );
    expect(container.querySelector('[data-testid="issue-side-sheet"]')).toBeNull();
  });

  it('shows detail and closes via button / backdrop / Escape', () => {
    const onClose = vi.fn();
    render(<IssueSideSheet issueId="iss-42" onClose={onClose} />);

    const sheet = screen.getByTestId('issue-side-sheet');
    expect(sheet).toHaveAttribute('data-issue-id', 'iss-42');
    expect(screen.getByTestId('issue-detail')).toHaveAttribute(
      'data-issue-id',
      'iss-42',
    );
    expect(screen.getByTestId('issue-detail')).toHaveAttribute(
      'data-variant',
      'sheet',
    );
    expect(screen.getByTestId('issue-side-sheet-fullpage')).toHaveAttribute(
      'href',
      '/issues/iss-42',
    );

    fireEvent.click(screen.getByTestId('issue-side-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.click(screen.getByTestId('issue-side-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
