// agent-chat：人↔agent 会话 API（对齐 Multica /chat：置顶 / 归档）
// B1 UX Trust：会话可绑 project → CLI cwd = project.localPath
import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  ArchiveChatThreadInput,
  CreateChatThreadInput,
  ListChatThreadsQuery,
  PinChatThreadInput,
  PostChatMessageInput,
  UpdateChatThreadProjectInput,
  type ChatExecContext,
  type ChatMessage,
  type ChatThread,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents, chatMessages, chatThreads, projects } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';
import { wakeRunWorker } from '../orchestration/run-worker.js';
import { resolveChatExecContext } from '../runtime/resolve-run-cwd.js';
import { formatTrailingUserText } from '../runtime/prompt.js';

function iso(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

function projectLocalPathFor(projectId: string | null | undefined): {
  path: string | null;
  title: string | null;
} {
  if (!projectId) return { path: null, title: null };
  const proj = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!proj) return { path: null, title: null };
  return { path: proj.localPath ?? null, title: proj.title };
}

function execForThread(threadId: string, projectId: string | null | undefined): ChatExecContext {
  const { path } = projectLocalPathFor(projectId);
  const exec = resolveChatExecContext(threadId, path);
  return {
    mode: exec.mode,
    modeLabel: exec.modeLabel,
    path: exec.path,
    exists: exec.exists,
  };
}

function toThread(
  row: typeof chatThreads.$inferSelect,
  lastPreview?: string | null,
): ChatThread {
  const projectId = (row as { projectId?: string | null }).projectId ?? null;
  const { title: projectTitle } = projectLocalPathFor(projectId);
  return {
    id: row.id,
    agentId: row.agentId,
    title: row.title,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
    lastMessagePreview: lastPreview ?? null,
    pinnedAt: iso(row.pinnedAt ?? null),
    archivedAt: iso(row.archivedAt ?? null),
    projectId,
    projectTitle,
    lastSessionId: (row as { lastSessionId?: string | null }).lastSessionId ?? null,
  };
}

function toMessage(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role as ChatMessage['role'],
    body: row.body,
    runId: row.runId ?? null,
    createdAt: iso(row.createdAt)!,
  };
}

function lastPreviewFor(threadId: string): string | null {
  const last = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1)
    .all()[0];
  if (!last) return null;
  return last.body.length > 120 ? `${last.body.slice(0, 120)}…` : last.body;
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/chat/threads?archived=1
  app.get('/api/chat/threads', async (req) => {
    const parsed = ListChatThreadsQuery.safeParse(req.query ?? {});
    const q = parsed.success ? parsed.data : {};
    const includeArchived = q.archived === '1' || q.archived === 'true';

    const rows = db
      .select()
      .from(chatThreads)
      .where(includeArchived ? isNotNull(chatThreads.archivedAt) : isNull(chatThreads.archivedAt))
      .orderBy(
        // Multica：pinned first, then recent activity
        sql`CASE WHEN ${chatThreads.pinnedAt} IS NULL THEN 1 ELSE 0 END`,
        desc(chatThreads.pinnedAt),
        desc(chatThreads.updatedAt),
      )
      .all();

    return rows.map((row) => toThread(row, lastPreviewFor(row.id)));
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
        pinnedAt: null,
        archivedAt: null,
        projectId: null,
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
    const base = toThread(row, lastPreviewFor(row.id));
    const execContext = execForThread(id, base.projectId);
    return { ...base, execContext };
  });

  // GET /api/chat/threads/:id/exec-context —— 会话头 cwd mode/path（可单独刷新）
  app.get('/api/chat/threads/:id/exec-context', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get();
    if (!row) return reply.status(404).send({ error: '会话不存在' });
    return execForThread(id, (row as { projectId?: string | null }).projectId);
  });

  // PATCH /api/chat/threads/:id/project  { projectId: string | null }
  app.patch('/api/chat/threads/:id/project', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateChatThreadProjectInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const row = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get();
    if (!row) return reply.status(404).send({ error: '会话不存在' });

    let projectId: string | null = parsed.data.projectId;
    if (projectId) {
      const proj = db.select().from(projects).where(eq(projects.id, projectId)).get();
      if (!proj) return reply.status(404).send({ error: 'project 不存在' });
    } else {
      projectId = null;
    }

    const now = Date.now();
    db.update(chatThreads)
      .set({ projectId, updatedAt: now })
      .where(eq(chatThreads.id, id))
      .run();
    const next = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get()!;
    const base = toThread(next, lastPreviewFor(id));
    const execContext = execForThread(id, base.projectId);
    return { ...base, execContext };
  });

  // PATCH /api/chat/threads/:id/pin  { pinned: boolean }
  // Multica：不 bump updated_at
  app.patch('/api/chat/threads/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PinChatThreadInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const row = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get();
    if (!row) return reply.status(404).send({ error: '会话不存在' });
    const now = Date.now();
    const pinnedAt = parsed.data.pinned ? row.pinnedAt ?? now : null;
    db.update(chatThreads)
      .set({ pinnedAt })
      .where(eq(chatThreads.id, id))
      .run();
    const next = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get()!;
    return toThread(next, lastPreviewFor(id));
  });

  // PATCH /api/chat/threads/:id/archive  { archived: boolean }
  app.patch('/api/chat/threads/:id/archive', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ArchiveChatThreadInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const row = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get();
    if (!row) return reply.status(404).send({ error: '会话不存在' });
    const now = Date.now();
    db.update(chatThreads)
      .set({
        archivedAt: parsed.data.archived ? row.archivedAt ?? now : null,
        // Multica：归档会 bump updated_at 以便归档列表排序
        updatedAt: now,
      })
      .where(eq(chatThreads.id, id))
      .run();
    const next = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get()!;
    return toThread(next, lastPreviewFor(id));
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
    if (thread.archivedAt != null) {
      return reply.status(400).send({ error: '会话已归档，无法发送' });
    }
    const agent = db.select().from(agents).where(eq(agents.id, thread.agentId)).get();
    if (!agent) return reply.status(404).send({ error: 'agent 不存在' });
    if (agent.archivedAt != null) {
      return reply.status(409).send({ error: '智能体已归档' });
    }

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

    const trailingText = formatTrailingUserText(threadId);

    // 防重：检查 thread 下是否已有 status === 'queued' 且 startedAt == null 的 Chat Run
    const existingQueuedRun = db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.chatThreadId, threadId),
          eq(agentRuns.kind, 'chat'),
          eq(agentRuns.status, 'queued'),
          isNull(agentRuns.startedAt),
        ),
      )
      .orderBy(asc(agentRuns.createdAt))
      .get();

    let targetRunId: string;

    if (existingQueuedRun) {
      targetRunId = existingQueuedRun.id;
      db.update(chatMessages)
        .set({ runId: targetRunId })
        .where(and(eq(chatMessages.threadId, threadId), isNull(chatMessages.runId)))
        .run();
      db.update(agentRuns)
        .set({ quickPrompt: trailingText })
        .where(eq(agentRuns.id, targetRunId))
        .run();
    } else {
      targetRunId = crypto.randomUUID();
      db.insert(agentRuns)
        .values({
          id: targetRunId,
          issueId: null,
          agentId: agent.id,
          runtime: agent.runtime,
          status: 'queued',
          kind: 'chat',
          quickPrompt: trailingText || body,
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

      db.update(chatMessages)
        .set({ runId: targetRunId })
        .where(and(eq(chatMessages.threadId, threadId), isNull(chatMessages.runId)))
        .run();
    }

    db.update(chatThreads).set({ updatedAt: now }).where(eq(chatThreads.id, threadId)).run();

    const run = toAgentRun(db.select().from(agentRuns).where(eq(agentRuns.id, targetRunId)).get()!);
    eventBus.publish({ type: 'run:queued', run });
    wakeRunWorker();

    const userMsg = toMessage(
      db.select().from(chatMessages).where(eq(chatMessages.id, userMsgId)).get()!,
    );
    return reply.status(201).send({ message: userMsg, run });
  });
}
