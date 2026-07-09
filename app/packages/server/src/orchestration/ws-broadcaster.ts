import type { WebSocket } from 'ws';
import type { DomainEvent } from '@ma/shared';

// spec §6.4：单 workspace，一个 set 简化
// spec §6.6：广播给所有人（含发起者）—— 发起窗口靠 setQueryData 幂等处理（spec §7.5 R4）
const OPEN = 1; // ws.readyState 的 OPEN 常量值

export class WsBroadcaster {
  private conns = new Set<WebSocket>();

  add(ws: WebSocket): void {
    this.conns.add(ws);
  }

  remove(ws: WebSocket): void {
    this.conns.delete(ws);
  }

  broadcast(e: DomainEvent): void {
    const msg = JSON.stringify(e);
    for (const ws of this.conns) {
      if (ws.readyState === OPEN) {
        ws.send(msg);
      }
    }
  }
}

export const wsBroadcaster = new WsBroadcaster();
