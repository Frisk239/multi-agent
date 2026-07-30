import { describe, expect, it } from 'vitest';
import { buildHelperFailCta, shouldStickHelperScroll } from './helper-chat-path';

describe('buildHelperFailCta', () => {
  it('surfaces send error with chat deep link', () => {
    const cta = buildHelperFailCta({
      lastSendError: 'network',
      threadId: 'th-1',
    });
    expect(cta.show).toBe(true);
    expect(cta.href).toContain('/chat');
    expect(cta.href).toContain('th-1');
  });

  it('surfaces readiness fail toward settings', () => {
    const cta = buildHelperFailCta({ readinessStatus: 'runtime_missing' });
    expect(cta.show).toBe(true);
    expect(cta.href).toBe('/settings');
  });

  it('hidden when healthy', () => {
    expect(buildHelperFailCta({ readinessStatus: 'ready' }).show).toBe(false);
  });
});

describe('shouldStickHelperScroll', () => {
  it('sticks on empty or near bottom', () => {
    expect(shouldStickHelperScroll({ messageCount: 0 })).toBe(true);
    expect(
      shouldStickHelperScroll({
        messageCount: 3,
        lastRole: 'assistant',
        userNearBottom: true,
      }),
    ).toBe(true);
  });

  it('does not force stick when user scrolled up', () => {
    expect(
      shouldStickHelperScroll({
        messageCount: 5,
        lastRole: 'assistant',
        userNearBottom: false,
      }),
    ).toBe(false);
  });
});
