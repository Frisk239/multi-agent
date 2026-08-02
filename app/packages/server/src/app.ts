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
import { agentTemplateRoutes } from './routes/agent-templates.js';
import { labelRoutes } from './routes/labels.js';
import { chatRoutes } from './routes/chat.js';
import { usageRoutes } from './routes/usage.js';
import { projectRoutes } from './routes/projects.js';
import { profileRoutes } from './routes/profile.js';
import { analyticsRoutes, opsAnalyticsRoute } from './routes/analytics.js';
import { healthzRoutes } from './routes/healthz.js';
import { opsRoutes } from './routes/ops.js';
import { attachmentRoutes } from './routes/attachments.js';
import { eventBus } from './orchestration/event-bus.js';
import { wsBroadcaster } from './orchestration/ws-broadcaster.js';
import { makeCorsOriginChecker, resolveCorsOrigins } from './cors-origin.js';
import { resolveListenHost } from './bind.js';
import { registerLocalTokenGuard } from './local-token.js';
import { syncAutomationRunFromAgentRun } from './orchestration/automation-execution.js';
import { isMaintenanceMode } from './safe-live-restore.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Slice 38：CORS 默认收紧到本机 web origin（MA_CORS_ORIGIN 可配）
  const corsAllowed = resolveCorsOrigins();
  await app.register(cors, {
    origin: makeCorsOriginChecker(corsAllowed),
  });
  await app.register(websocket);

  // Slice 49：非 loopback + MA_LOCAL_TOKEN 时保护 /api/* 与 /ws（/healthz 放行）
  registerLocalTokenGuard(app, { listenHost: resolveListenHost() });
  app.addHook('onRequest', async (req, reply) => {
    if (!isMaintenanceMode() || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (req.url.startsWith('/api/ops/snapshot-restores/')) return;
    return reply.status(503).send({
      success: false,
      code: 'MAINTENANCE_MODE',
      error: '系统正在执行恢复维护，已拒绝新的写入与派活',
    });
  });

  // 接线（spec §6.5）：eventBus → wsBroadcaster
  eventBus.on((e) => {
    if (
      e.type === 'run:queued' ||
      e.type === 'run:waiting_local_directory' ||
      e.type === 'run:running' ||
      e.type === 'run:completed' ||
      e.type === 'run:failed' ||
      e.type === 'run:cancelled'
    ) {
      syncAutomationRunFromAgentRun(e.run);
    }
    wsBroadcaster.broadcast(e);
  });

  await app.register(healthzRoutes);
  await app.register(opsRoutes);
  await app.register(issueRoutes);
  await app.register(labelRoutes);
  await app.register(commentRoutes);
  // S4：附件路由自成插件作用域（内部注册了 '*' buffer parser，不影响其它路由的 JSON 解析）
  await app.register(attachmentRoutes);
  await app.register(rosterRoutes);
  await app.register(agentTemplateRoutes);
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
  await app.register(analyticsRoutes);
  await app.register(opsAnalyticsRoute);
  await app.register(projectRoutes);
  await app.register(profileRoutes);
  await app.register(wsRoutes);

  return app;
}
