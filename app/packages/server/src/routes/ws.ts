import type { FastifyInstance } from 'fastify';
import { WsClientMessage } from '@ma/shared';
import { wsBroadcaster } from '../orchestration/ws-broadcaster.js';

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  // Slice 26：连上默认全量（旧兼容）；客户端可发 {type:'subscribe', topics} 过滤
  app.get('/ws', { websocket: true }, (socket) => {
    wsBroadcaster.add(socket);

    socket.on('message', (raw) => {
      try {
        const text =
          typeof raw === 'string'
            ? raw
            : Buffer.isBuffer(raw)
              ? raw.toString('utf8')
              : Array.isArray(raw)
                ? Buffer.concat(raw).toString('utf8')
                : String(raw);
        const json: unknown = JSON.parse(text);
        const parsed = WsClientMessage.safeParse(json);
        if (!parsed.success) return;
        if (parsed.data.type === 'subscribe') {
          wsBroadcaster.setTopics(socket, parsed.data.topics);
        }
      } catch {
        // 忽略坏帧
      }
    });

    socket.on('close', () => {
      wsBroadcaster.remove(socket);
    });
  });
}
