// agent-chat：人↔agent 会话 API（对齐 Multica /chat 体验的本地 MVP）
import type { FastifyInstance } from 'fastify';
import { asc, desc, eq } from 'drizzle-orm';
import {
  CreateChatThreadInput,
  PostChatMessageInput,
  type ChatMessage,
  type ChatThread,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents, chatMessages, chatThreads } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';
import { wakeRunWorker } from '../orchestration/run-worker.js';

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function toThread(
  row: typeof chatThreads.$inferSelect,
  lastPreview?: string | null,
): ChatThread {
  return {
    id: row.id,
    agentId: row.agentId,
    title: row.title,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    lastMessagePreview: lastPreview ?? null,
  };
}

function toMessage(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role as ChatMessage['role'],
    body: row.body,
    runId: row.runId ?? null,
    createdAt: iso(row.createdAt),
  };
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/chat/threads
  app.get('/api/chat/threads', async () => {
    const rows = db
      .select()
      .from(chatThreads)
      .orderBy(desc(chatThreads.updatedAt))
      .all();
    return rows.map((row) => {
      const last = db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, row.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1)
        .all()[0];
      const preview = last
        ? last.body.length > 120
          ? `${last.body.slice(0, 120)}…`
          : last.body
        : null;
      return toThread(row, preview);
    });
  });

  // POST /api/chat/threads
  app.post('/api/chat/threads', async (req, reply) => {
    const parsed = CreateChatThreadInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const agent = db.select().from(agents).where(eq(agents.id, parsed.data.agentId)).get();
    if (!agent) return reply.status(404).send({ error: 'agent 不存在' });
    const now = Date.now();
    const id = crypto.randomUUID();
    const title = parsed.data.title?.trim() || `与 ${agent.name} 的对话`;
    db.insert(chatThreads)
      .values({
        id,
        agentId: agent.id,
        title,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const row = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get()!;
    return reply.status(201).send(toThread(row, null));
  });

  // GET /api/chat/threads/:id
  app.get('/api/chat/threads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get();
    if (!row) return reply.status(404).send({ error: '会话不存在' });
    return toThread(row, null);
  });

  // GET /api/chat/threads/:id/messages
  app.get('/api/chat/threads/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const thread = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get();
    if (!thread) return reply.status(404).send({ error: '会话不存在' });
    const rows = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, id))
      .orderBy(asc(chatMessages.createdAt))
      .all();
    return rows.map(toMessage);
  });

  // POST /api/chat/threads/:id/messages —— 写 user 消息 + enqueue chat run
  app.post('/api/chat/threads/:id/messages', async (req, reply) => {
    const { id: threadId } = req.params as { id: string };
    const parsed = PostChatMessageInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const thread = db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).get();
    if (!thread) return reply.status(404).send({ error: '会话不存在' });
    const agent = db.select().from(agents).where(eq(agents.id, thread.agentId)).get();
    if (!agent) return reply.status(404).send({ error: 'agent 不存在' });

    const now = Date.now();
    const body = parsed.data.body.trim();
    const userMsgId = crypto.randomUUID();
    db.insert(chatMessages)
      .values({
        id: userMsgId,
        threadId,
        role: 'user',
        body,
        runId: null,
        createdAt: now,
      })
      .run();

    const runId = crypto.randomUUID();
    db.insert(agentRuns)
      .values({
        id: runId,
        issueId: null,
        agentId: agent.id,
        runtime: agent.runtime,
        status: 'queued',
        kind: 'chat',
        quickPrompt: body,
        chatThreadId: threadId,
        isLeader: 0,
        squadId: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: null,
        createdAt: now,
      })
      .run();

    // 关联 user 消息的 runId（可选追溯）
    db.update(chatMessages).set({ runId }).where(eq(chatMessages.id, userMsgId)).run();
    db.update(chatThreads).set({ updatedAt: now }).where(eq(chatThreads.id, threadId)).run();

    const run = toAgentRun(db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get()!);
    eventBus.publish({ type: 'run:queued', run });
    wakeRunWorker();

    const userMsg = toMessage(
      db.select().from(chatMessages).where(eq(chatMessages.id, userMsgId)).get()!,
    );
    return reply.status(201).send({ message: userMsg, run });
  });
}
