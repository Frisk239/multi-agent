import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents } from '../db/schema.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { enqueueAgentRun, enqueueLeaderRun } from './run-service.js';
import { eventBus } from './event-bus.js';
import { wakeRunWorker } from './run-worker.js';
import { toAgentRun } from '../db/reshape.js';
import { logger } from '../logger.js';

export async function parseAndDispatchSubagents(parentRunId: string, text: string) {
  const parentRun = db.select().from(agentRuns).where(eq(agentRuns.id, parentRunId)).get();
  if (!parentRun) return;

  const delegations: { targetId: string; prompt: string }[] = [];

  // Parse [delegate:<agent_or_squad_id>](<task_prompt>)
  const regex = /\[delegate:([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    delegations.push({ targetId: match[1], prompt: match[2] });
  }

  // Parse JSON format
  // Example: {"delegate": "agent-id", "prompt": "task"} or array of these
  const jsonRegex = /```json\s*([\s\S]*?)\s*```/g;
  while ((match = jsonRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object' && item.delegate && item.prompt) {
          delegations.push({ targetId: item.delegate, prompt: item.prompt });
        }
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  for (const { targetId, prompt } of delegations) {
    await dispatchSubagent(parentRun, targetId, prompt);
  }
}

async function dispatchSubagent(parentRun: any, targetId: string, prompt: string) {
  let isLeader = false;
  let squadId: string | null = null;
  let agentId: string | null = null;

  const agent = db.select().from(agents).where(eq(agents.id, targetId)).get();
  if (agent) {
    agentId = agent.id;
  } else {
    const squad = loadSquadDetail(targetId);
    if (squad && squad.leaderId) {
      agentId = squad.leaderId;
      isLeader = true;
      squadId = squad.id;
    } else {
      logger.error(`Subagent delegation failed: target ${targetId} not found or no leader`);
      return;
    }
  }

  if (parentRun.issueId) {
    // If the parent has an issueId, use runService checkAndEnqueue to benefit from duplication checks, readiness etc.
    if (isLeader && squadId) {
      await enqueueLeaderRun(parentRun.issueId, agentId, squadId, {
        parentRunId: parentRun.id,
        quickPrompt: prompt,
      });
    } else {
      await enqueueAgentRun(parentRun.issueId, agentId, {
        parentRunId: parentRun.id,
        quickPrompt: prompt,
      });
    }
  } else {
    // If no issueId (e.g. chat or quick_create without issueId), directly enqueue
    const realAgent = db.select().from(agents).where(eq(agents.id, agentId)).get()!;
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const kind = (parentRun.kind as string) ?? 'issue';
    db.insert(agentRuns)
      .values({
        id,
        issueId: parentRun.issueId,
        agentId,
        runtime: realAgent.runtime,
        status: 'queued',
        kind: 'quick_create', // Since it has a prompt, treat it as quick_create
        quickPrompt: prompt,
        isLeader: isLeader ? 1 : 0,
        squadId,
        projectId: parentRun.projectId,
        chatThreadId: parentRun.chatThreadId,
        parentRunId: parentRun.id,
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
  }
}
