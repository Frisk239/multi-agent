import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { issueRoutes } from './routes/issues.js';
import { commentRoutes } from './routes/comments.js';
import { rosterRoutes } from './routes/roster.js';
import { skillRoutes } from './routes/skills.js';
import { runRoutes } from './routes/runs.js';
import { runtimeRoutes } from './routes/runtimes.js';
import { wsRoutes } from './routes/ws.js';
import { wikiRoutes } from './routes/wiki.js';
import { memoryRoutes } from './routes/memory.js';
import { inboxRoutes } from './routes/inbox.js';
import { quickRunRoutes } from './routes/quick-runs.js';
import { settingsRoutes } from './routes/settings.js';
import { automationRoutes } from './routes/automation.js';
import { labelRoutes } from './routes/labels.js';
import { chatRoutes } from './routes/chat.js';
import { usageRoutes } from './routes/usage.js';
import { eventBus } from './orchestration/event-bus.js';
import { wsBroadcaster } from './orchestration/ws-broadcaster.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ['http://localhost:3000'],
  });
  await app.register(websocket);

  // 接线（spec §6.5）：eventBus → wsBroadcaster
  eventBus.on((e) => wsBroadcaster.broadcast(e));

  await app.register(issueRoutes);
  await app.register(labelRoutes);
  await app.register(commentRoutes);
  await app.register(rosterRoutes);
  await app.register(skillRoutes);
  await app.register(runRoutes);
  await app.register(quickRunRoutes);
  await app.register(runtimeRoutes);
  await app.register(wikiRoutes);
  await app.register(memoryRoutes);
  await app.register(inboxRoutes);
  await app.register(settingsRoutes);
  await app.register(automationRoutes);
  await app.register(chatRoutes);
  await app.register(usageRoutes);
  await app.register(wsRoutes);

  return app;
}
