import type { DomainEvent } from '@ma/shared';

type Listener = (e: DomainEvent) => void;

// 同步 in-process 事件总线（学 multica events.Bus）
// 同步派发保证事件顺序；错误隔离不中断后续监听器
export class EventBus {
  private listeners = new Set<Listener>();

  on(fn: Listener): void {
    this.listeners.add(fn);
  }

  off(fn: Listener): void {
    this.listeners.delete(fn);
  }

  publish(e: DomainEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch (err) {
        console.error('[event-bus] 监听器异常:', err);
      }
    }
  }
}

export const eventBus = new EventBus();
