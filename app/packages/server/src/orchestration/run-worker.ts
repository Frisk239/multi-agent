import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, runMessages, comments } from '../db/schema.js';
import { toAgentRun, toRunMessage, toComment } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { registerRunAbort, clearRunAbort } from './run-control.js';
import { getBackend } from '../runtime/registry.js';
import { buildPrompt } from '../runtime/prompt.js';
import type { AgentEvent } from '../runtime/types.js';

// RunWorker —— 主进程内的单线程 run 执行循环（spec §6.2，学 multica daemon）。
// - timer 每 500ms tick；wake 可立即触发
// - busy 锁防并发（同进程无竞态，锁只是防 setInterval 重入）
// - tick: claim 一条 queued → running → backend.execute → 终态写库 + 事件

let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

export function startRunWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, 500);
}

export function wakeRunWorker(): void {
  void tick();
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const queued = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.status, 'queued'))
      .orderBy(asc(agentRuns.createdAt))
      .limit(1)
      .get();
    if (!queued) return;

    const now = Date.now();
    // claim: 条件 UPDATE（DB 行即锁，学 multica）。
    // drizzle 0.33 better-sqlite3 的 returning() 可能不可用（注意点 4），
    // 用 update 后 select 校验 status==='running' 兜底。
    db.update(agentRuns)
      .set({ status: 'running', startedAt: now })
      .where(and(eq(agentRuns.id, queued.id), eq(agentRuns.status, 'queued')))
      .run();
    const runRow = db.select().from(agentRuns).where(eq(agentRuns.id, queued.id)).get();
    if (!runRow || runRow.status !== 'running') return;

    const run = toAgentRun(runRow);
    eventBus.publish({ type: 'run:running', run });

    const cwd = process.env.MA_WORKSPACE_CWD;
    if (!cwd) {
      await failRun(runRow.id, '未配置 MA_WORKSPACE_CWD');
      return;
    }
    const prompt = buildPrompt(runRow.issueId);
    if (!prompt) {
      await failRun(runRow.id, 'issue 不存在');
      return;
    }

    const signal = registerRunAbort(runRow.id);
    let seq = 0;
    const nextSeq = () => ++seq;

    // onEvent —— Backend 事件分流（spec §6.2 + §3.4 comment 分工）：
    //   progress/log/delta → run:progress only（不进 DB）
    //   message/tool_* → run_message + run:message 事件
    const onEvent = (e: AgentEvent) => {
      if (e.type === 'message_delta' || e.type === 'log') {
        eventBus.publish({
          type: 'run:progress',
          runId: runRow.id,
          issueId: runRow.issueId,
          text: e.text,
        });
        return;
      }
      let kind: 'assistant' | 'user' | 'tool_start' | 'tool_end' | 'system' = 'system';
      let body = '';
      if (e.type === 'message') {
        kind = e.role === 'user' ? 'user' : 'assistant';
        body = e.text;
      } else if (e.type === 'tool_start') {
        kind = 'tool_start';
        body = JSON.stringify({ name: e.name, args: e.args ?? null });
      } else if (e.type === 'tool_end') {
        kind = 'tool_end';
        body = JSON.stringify({ name: e.name, result: e.result ?? '' });
      }
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const s = nextSeq();
      db.insert(runMessages)
        .values({ id, runId: runRow.id, seq: s, kind, body, createdAt })
        .run();
      const message = toRunMessage({
        id,
        runId: runRow.id,
        seq: s,
        kind,
        body,
        createdAt,
      });
      eventBus.publish({ type: 'run:message', message, issueId: runRow.issueId });
    };

    try {
      const backend = getBackend(runRow.runtime);
      const result = await backend.execute(
        {
          prompt,
          cwd,
          issueId: runRow.issueId,
          agentId: runRow.agentId,
          runId: runRow.id,
        },
        onEvent,
        signal,
      );
      clearRunAbort(runRow.id);
      const finishedAt = Date.now();

      if (result.exitReason === 'cancelled' || signal.aborted) {
        db.update(agentRuns)
          .set({ status: 'cancelled', finishedAt, error: result.error ?? null })
          .where(eq(agentRuns.id, runRow.id))
          .run();
        const r = toAgentRun(
          db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!,
        );
        eventBus.publish({ type: 'run:cancelled', run: r });
        return;
      }

      if (result.exitReason === 'failed') {
        await failRun(runRow.id, result.error ?? '执行失败');
        return;
      }

      // completed —— 写终态 + 一条 agent comment（人读最终回复，spec §3.4）
      db.update(agentRuns)
        .set({ status: 'completed', finishedAt, error: null })
        .where(eq(agentRuns.id, runRow.id))
        .run();
      const finalText = result.finalText || '(无输出)';
      const cid = crypto.randomUUID();
      db.insert(comments)
        .values({
          id: cid,
          issueId: runRow.issueId,
          type: 'comment',
          authorType: 'agent',
          authorId: runRow.agentId,
          body: finalText,
          createdAt: finishedAt,
        })
        .run();
      const cRow = db.select().from(comments).where(eq(comments.id, cid)).get()!;
      eventBus.publish({ type: 'comment:created', comment: toComment(cRow) });
      const r = toAgentRun(
        db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!,
      );
      eventBus.publish({ type: 'run:completed', run: r });
    } catch (err) {
      clearRunAbort(runRow.id);
      await failRun(runRow.id, String(err));
    }
  } finally {
    busy = false;
  }
}

async function failRun(runId: string, error: string): Promise<void> {
  const finishedAt = Date.now();
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (row) {
    db.update(agentRuns)
      .set({ status: 'failed', finishedAt, error })
      .where(eq(agentRuns.id, runId))
      .run();
    const r = toAgentRun(
      db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get()!,
    );
    eventBus.publish({ type: 'run:failed', run: r });
  }
}
