import type { FastifyInstance } from 'fastify';
import { wsBroadcaster } from '../orchestration/ws-broadcaster.js';

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  // spec §6.1：无鉴权、无房间协议，连上即收全量 issue 事件
  app.get('/ws', { websocket: true }, (socket) => {
    wsBroadcaster.add(socket);
    socket.on('close', () => {
      wsBroadcaster.remove(socket);
    });
  });
}
