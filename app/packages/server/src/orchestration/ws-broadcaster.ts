import type { WebSocket } from 'ws';
import type { DomainEvent } from '@ma/shared';

// spec §6.4：单 workspace，一个 set 简化
// Slice 26：可选 topic 过滤；topics=null = 全量（旧客户端兼容）
const OPEN = 1; // ws.readyState 的 OPEN 常量值

/** Stream 档（S）：仅 run: / run:{id} 匹配 */
const STREAM_EVENT_TYPES = new Set<DomainEvent['type']>([
  'run:progress',
  'run:stream_chunk',
  'run:message',
  'runtime:event',
]);

/** Run 生命周期（L）：可用 issue / agent / run 前缀 */
const RUN_LIFECYCLE_TYPES = new Set<DomainEvent['type']>([
  'run:queued',
  'run:waiting_local_directory',
  'run:running',
  'run:deferred',
  'run:completed',
  'run:failed',
  'run:cancelled',
]);

interface TrackedWebSocket extends WebSocket {
  isAlive: boolean;
  /** null = 全量 fanout；非 null = 订阅全集（replace） */
  topics: string[] | null;
}

function hasKind(topics: string[], kind: string, id?: string | null): boolean {
  const prefix = `${kind}:`;
  if (topics.includes(prefix)) return true;
  if (id != null && id !== '' && topics.includes(prefix + id)) return true;
  return false;
}

function runIdFromEvent(e: DomainEvent): string | null {
  switch (e.type) {
    case 'run:progress':
    case 'run:stream_chunk':
      return e.runId;
    case 'run:message':
      return e.message.runId;
    case 'runtime:event':
      return e.event.runId;
    case 'run:queued':
    case 'run:waiting_local_directory':
    case 'run:running':
    case 'run:deferred':
    case 'run:completed':
    case 'run:failed':
    case 'run:cancelled':
      return e.run.id;
    default:
      return null;
  }
}

/**
 * topics=null → 全量；否则按 L/S 规则匹配。
 * 导出供单测。
 */
export function eventMatchesTopics(
  e: DomainEvent,
  topics: string[] | null,
): boolean {
  if (topics == null) return true;

  // S 档：stream 仅 run: / run:{id}
  if (STREAM_EVENT_TYPES.has(e.type)) {
    return hasKind(topics, 'run', runIdFromEvent(e));
  }

  // L 档 run 生命周期：run / issue / agent 任一命中
  if (RUN_LIFECYCLE_TYPES.has(e.type) && 'run' in e) {
    const run = e.run;
    return (
      hasKind(topics, 'run', run.id) ||
      hasKind(topics, 'issue', run.issueId) ||
      hasKind(topics, 'agent', run.agentId)
    );
  }

  switch (e.type) {
    case 'issue:created':
    case 'issue:updated':
      return hasKind(topics, 'issue', e.issue.id);
    case 'issue:deleted':
      return hasKind(topics, 'issue', e.issueId);
    case 'comment:created':
      return hasKind(topics, 'issue', e.comment.issueId);
    case 'activity:created':
      return hasKind(topics, 'issue', e.issueId);
    case 'agent:status_changed':
      return hasKind(topics, 'agent', e.agentId);
    case 'inbox:item':
      return hasKind(topics, 'inbox');
    case 'wiki:page-created':
      return hasKind(topics, 'wiki');
    case 'automation:updated':
      return hasKind(topics, 'automation');
    default:
      return false;
  }
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
    // 旧客户端不发 subscribe → 保持全量
    tws.topics = null;
    tws.on('pong', () => {
      tws.isAlive = true;
    });
    this.conns.add(tws);
  }

  remove(ws: WebSocket | TrackedWebSocket): void {
    this.conns.delete(ws as TrackedWebSocket);
  }

  /** replace 订阅全集；null = 恢复全量 */
  setTopics(ws: WebSocket, topics: string[] | null): void {
    const tws = ws as TrackedWebSocket;
    if (!this.conns.has(tws)) return;
    tws.topics = topics;
  }

  getTopics(ws: WebSocket): string[] | null | undefined {
    const tws = ws as TrackedWebSocket;
    if (!this.conns.has(tws)) return undefined;
    return tws.topics;
  }

  broadcast(e: DomainEvent): void {
    const msg = JSON.stringify(e);
    for (const ws of this.conns) {
      if (ws.readyState !== OPEN) continue;
      if (!eventMatchesTopics(e, ws.topics)) continue;
      ws.send(msg);
    }
  }

  /** 测试/关停用 */
  connectionCount(): number {
    return this.conns.size;
  }
}

export const wsBroadcaster = new WsBroadcaster();
