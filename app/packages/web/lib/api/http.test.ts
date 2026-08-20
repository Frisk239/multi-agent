import { describe, expect, it, vi } from 'vitest';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('../toast', () => ({ toastError }));

import { toastEnqueueMeta } from './http';

describe('toastEnqueueMeta archived Agent recovery action', () => {
  it('explains agent_archived and deep-links to the actual archived roster scope', () => {
    toastEnqueueMeta('iss-archive', {
      status: 'skipped',
      reason: 'agent_archived',
      detail: '智能体「甲」已归档，恢复后才能派发',
      runId: null,
    });

    expect(toastError).toHaveBeenCalledWith(
      '智能体「甲」已归档，恢复后才能派发',
      expect.objectContaining({
        action: {
          label: '查看已归档智能体',
          href: '/agents?scope=archived',
        },
      }),
    );
  });
});
