import type { WebSocket } from 'ws';
import type { DomainEvent } from '@ma/shared';

// spec §6.4：单 workspace，一个 set 简化
// spec §6.6：广播给所有人（含发起者）—— 发起窗口靠 setQueryData 幂等处理（spec §7.5 R4）
const OPEN = 1; // ws.readyState 的 OPEN 常量值

interface TrackedWebSocket extends WebSocket {
  isAlive: boolean;
}

export class WsBroadcaster {
  private conns = new Set<TrackedWebSocket>();
  private interval: NodeJS.Timeout;

  constructor() {
    // 30s heartbeat ping
    this.interval = setInterval(() => {
      for (const ws of this.conns) {
        if (ws.isAlive === false) {
          this.remove(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  add(ws: WebSocket): void {
    const tws = ws as TrackedWebSocket;
    tws.isAlive = true;
    tws.on('pong', () => {
      tws.isAlive = true;
    });
    this.conns.add(tws);
  }

  remove(ws: WebSocket | TrackedWebSocket): void {
    this.conns.delete(ws as TrackedWebSocket);
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
