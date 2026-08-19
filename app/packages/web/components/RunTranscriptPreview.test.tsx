import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunMessage } from '@ma/shared';
import { RunTranscriptPreview } from './RunTranscriptPreview';

const messages: RunMessage[] = [1, 2, 3, 4, 5].map((seq) => ({
  id: `m-${seq}`,
  runId: 'run-1',
  seq,
  kind: 'user' as const,
  body: `msg-${seq}`,
  createdAt: `2026-07-30T00:00:0${seq}.000Z`,
}));

vi.mock('@/lib/api', () => ({
  useRunMessages: () => ({ data: messages, isLoading: false, isError: false }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('RunTranscriptPreview tail window', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the latest items and earlier-hidden count', () => {
    render(<RunTranscriptPreview runId="run-1" maxItems={2} />);
    expect(screen.getByText('msg-4')).toBeTruthy();
    expect(screen.getByText('msg-5')).toBeTruthy();
    expect(screen.queryByText('msg-1')).toBeNull();
    expect(screen.getByText(/更早 3 条未展开/)).toBeTruthy();
  });
});
