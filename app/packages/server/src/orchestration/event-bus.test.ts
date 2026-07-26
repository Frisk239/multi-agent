import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from './event-bus';
import type { DomainEvent } from '@ma/shared';

describe('EventBus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows subscribing to and publishing domain events', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on(listener);

    const mockEvent: DomainEvent = {
      type: 'issue:created',
      payload: {
        issue: {
          id: 'iss-1',
          title: 'Test',
          status: 'todo',
          priority: 'medium',
          assigneeType: null,
          assigneeId: null,
          creatorType: 'member',
          creatorId: 'usr-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    } as unknown as DomainEvent;

    bus.publish(mockEvent);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(mockEvent);
  });

  it('allows unsubscribing listeners with off()', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on(listener);
    bus.off(listener);

    const mockEvent = { type: 'test' } as unknown as DomainEvent;
    bus.publish(mockEvent);

    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates errors in listeners so subsequent listeners still execute', () => {
    const bus = new EventBus();
    const faultyListener = vi.fn().mockImplementation(() => {
      throw new Error('Listener failed');
    });
    const goodListener = vi.fn();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.on(faultyListener);
    bus.on(goodListener);

    const mockEvent = { type: 'test' } as unknown as DomainEvent;
    bus.publish(mockEvent);

    expect(faultyListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
