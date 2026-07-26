import type { DomainEvent } from '@ma/shared';
import { broadcastAgentStatus } from './agent-status-broadcaster.js';

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
    // 自动拦截 Run 生命周期事件，触发 agent:status_changed 广播
    if (
      e.type === 'run:queued' ||
      e.type === 'run:waiting_local_directory' ||
      e.type === 'run:running' ||
      e.type === 'run:completed' ||
      e.type === 'run:failed' ||
      e.type === 'run:cancelled'
    ) {
      try {
        broadcastAgentStatus(e.run.agentId, e.run.id);
      } catch (err) {
        console.error('[event-bus] 广播 agent:status_changed 异常:', err);
      }
    }

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
