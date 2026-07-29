import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import type { ActivityLog } from '@ma/shared';

let activities: ActivityLog[] = [];

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api', () => ({
  useActivities: () => ({
    data: activities,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ActivityTimeline } from './ActivityTimeline';

describe('ActivityTimeline mention delegation', () => {
  afterEach(() => {
    cleanup();
    activities = [];
  });

  it('renders the mention badge and a deep link to the dispatched run', () => {
    activities = [
      {
        id: 'activity-1',
        issueId: 'issue-42',
        actorType: 'system',
        actorId: null,
        actorName: 'System',
        eventType: 'mention_delegated',
        payload: {
          targetId: 'agent-1',
          targetKind: 'agent',
          runId: 'run-123456789',
        },
        createdAt: '2026-07-29T00:00:00.000Z',
      },
    ];

    render(<ActivityTimeline issueId="issue-42" />);

    expect(screen.getByText(/提及委派/)).toBeTruthy();
    const link = screen.getByRole('link', { name: /run-1234/i });
    expect(link).toHaveAttribute('href', '/runs?run=run-123456789');
  });
});
