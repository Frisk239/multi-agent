import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { CreateQuickRunInput } from '@ma/shared';
import { db } from '../db/client.js';
import { agents, agentRuns } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { eventBus } from '../orchestration/event-bus.js';
import { computeAgentReadiness } from '../orchestration/readiness.js';
import { wakeRunWorker } from '../orchestration/run-worker.js';

function allowNotReadyEnqueue(): boolean {
  const v = process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  return v === '1' || v === 'true';
}

// bu03：POST /api/quick-runs —— 无 Issue 先 enqueue quick_create run
// A3：与 Issue enqueue 同级 readiness 硬闸（runtime / opt-in cwd），不静默 queued
export async function quickRunRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/quick-runs', async (req, reply) => {
    const parsed = CreateQuickRunInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { prompt, assignee } = parsed.data;

    let agentId: string;
    let isLeader = false;
    let squadId: string | null = null;

    if (assignee.type === 'agent') {
      const agent = db.select().from(agents).where(eq(agents.id, assignee.id)).get();
      if (!agent) return reply.status(404).send({ error: 'agent 不存在' });
      agentId = agent.id;
    } else {
      const squad = loadSquadDetail(assignee.id);
      if (!squad) return reply.status(404).send({ error: 'squad 不存在' });
      if (!squad.leaderId) {
        return reply.status(400).send({ error: 'squad 无 leader，无法快速派活' });
      }
      const leader = db.select().from(agents).where(eq(agents.id, squad.leaderId)).get();
      if (!leader) return reply.status(404).send({ error: 'squad leader 不存在' });
      agentId = leader.id;
      isLeader = true;
      squadId = squad.id;
    }

    // A3：硬闸对齐 issue enqueue（busy 仍可排队）
    if (!allowNotReadyEnqueue()) {
      const rd = await computeAgentReadiness(agentId);
      if (!rd) {
        return reply.status(404).send({ error: 'agent 不存在' });
      }
      if (rd.status === 'cwd_missing') {
        return reply.status(409).send({
          error: rd.detail ?? '工作区未就绪，无法快速派活（MA_ISSUE_USE_WORKSPACE_CWD）',
          reason: 'cwd_missing',
          enqueue: { status: 'skipped', reason: 'cwd_missing', detail: rd.detail },
        });
      }
      if (rd.status === 'runtime_missing') {
        return reply.status(409).send({
          error: rd.detail ?? `runtime ${rd.runtime} 未安装或不在 PATH`,
          reason: 'runtime_missing',
          enqueue: { status: 'skipped', reason: 'runtime_missing', detail: rd.detail },
        });
      }
      if (rd.status === 'error') {
        return reply.status(409).send({
          error: rd.detail ?? 'agent 就绪探测失败',
          reason: 'readiness_error',
          enqueue: { status: 'skipped', reason: 'readiness_error', detail: rd.detail },
        });
      }
    }

    const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()!;
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    db.insert(agentRuns)
      .values({
        id,
        issueId: null,
        agentId,
        runtime: agent.runtime,
        status: 'queued',
        kind: 'quick_create',
        quickPrompt: prompt,
        isLeader: isLeader ? 1 : 0,
        squadId,
        error: null,
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: null,
        createdAt,
      })
      .run();

    const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()!;
    const run = toAgentRun(row);
    eventBus.publish({ type: 'run:queued', run });
    wakeRunWorker();
    return reply.status(201).send({ run });
  });
}
