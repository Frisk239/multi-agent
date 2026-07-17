import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { CreateQuickRunInput } from '@ma/shared';
import { db } from '../db/client.js';
import { agents, agentRuns } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { eventBus } from '../orchestration/event-bus.js';
import { wakeRunWorker } from '../orchestration/run-worker.js';

// bu03：POST /api/quick-runs —— 无 Issue 先 enqueue quick_create run
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
