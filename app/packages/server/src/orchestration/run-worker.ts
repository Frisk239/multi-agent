import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, runMessages, comments, agents, issues } from '../db/schema.js';
import { toAgentRun, toRunMessage, toComment } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { registerRunAbort, clearRunAbort } from './run-control.js';
import { getBackend } from '../runtime/registry.js';
import { buildPrompt } from '../runtime/prompt.js';
import { triggerFromComment } from './comment-trigger.js';
import { memoryManager } from '../memory/manager.js';
import type { AgentEvent } from '../runtime/types.js';

// RunWorker —— 主进程内的单线程 run 执行循环（spec §6.2，学 multica daemon）。
// S04 并发模型改造（★核心重写，spec §6.2 R3）：
// - 删除 S03 的全局 busy 锁（单 run 串行）→ per-agent 槽（agent.concurrency）
// - timer 每 500ms tick；wake 可立即触发
// - tick: 遍历所有 queued，对每个检查其 agent 的 per-agent 槽位，
//   可用的 claim 并 fire-and-forget 执行（不 await，多个 run 并发）
// 并发安全（排雷补充#5）：Node 单线程 + tick 内 executeRun fire-and-forget（void，不 await）
//   = tick 同步跑完不会并发重入。不加锁——加锁反而会导致 executeRun 异步续体和 tick 死锁。
//   多个 executeRun 并发时各自 onEvent 同步写 DB（better-sqlite3 线程安全）+ eventBus 同步遍历。

let timer: ReturnType<typeof setInterval> | null = null;

export function startRunWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, 500);
}

export function wakeRunWorker(): void {
  void tick();
}

// tick —— 遍历 queued，对每个检查其 agent 的 per-agent 槽位（active running < agent.concurrency），
// 可用的 claim 并 fire-and-forget 执行（不 await，多个 run 并发）。
async function tick(): Promise<void> {
  const queuedRows = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'queued'))
    .orderBy(asc(agentRuns.createdAt))
    .all();

  for (const queued of queuedRows) {
    // per-agent 槽位检查
    const agent = db.select().from(agents).where(eq(agents.id, queued.agentId)).get();
    if (!agent) continue;
    const activeCount = db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(agentRuns)
      .where(
        and(eq(agentRuns.agentId, queued.agentId), eq(agentRuns.status, 'running')),
      )
      .get();
    if ((activeCount?.cnt ?? 0) >= agent.concurrency) continue; // 该 agent 槽满，跳过

    // claim（条件 UPDATE queued→running）
    const now = Date.now();
    db.update(agentRuns)
      .set({ status: 'running', startedAt: now })
      .where(and(eq(agentRuns.id, queued.id), eq(agentRuns.status, 'queued')))
      .run();
    const runRow = db.select().from(agentRuns).where(eq(agentRuns.id, queued.id)).get();
    if (!runRow || runRow.status !== 'running') continue; // 没抢到（被别的 tick 抢）

    const run = toAgentRun(runRow);
    eventBus.publish({ type: 'run:running', run });

    // fire-and-forget 并发执行（不 await）
    void executeRun(runRow);
  }
}

// executeRun —— 单个 run 的完整执行（从 S03 tick 内部提取，支持并发）。
async function executeRun(runRow: typeof agentRuns.$inferSelect): Promise<void> {
  const cwd = process.env.MA_WORKSPACE_CWD;
  if (!cwd) {
    await failRun(runRow.id, '未配置 MA_WORKSPACE_CWD');
    return;
  }
  // S10：buildPrompt 已 async，必须 await（R7）
  const prompt = await buildPrompt(runRow.issueId, {
    isLeader: runRow.isLeader === 1,
    squadId: runRow.squadId,
    agentId: runRow.agentId, // S05：查 agent_skill 分配 → skillBlock 拼接
  });
  if (!prompt) {
    await failRun(runRow.id, 'issue 不存在');
    return;
  }

  // S05：claim 后查 agent.mcpServers，传进 ExecutionInput（claude-code 写临时文件 + --mcp-config）
  const agentRow = db.select().from(agents).where(eq(agents.id, runRow.agentId)).get();
  const mcpServers = agentRow?.mcpServers ?? null;

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
        mcpServers, // S05：MCP 配置 JSON 字符串（null 则 backend 忽略）
      },
      onEvent,
      signal,
    );
    clearRunAbort(runRow.id);
    const finishedAt = Date.now();

    if (result.exitReason === 'cancelled' || signal.aborted) {
      // A1 修复（审计）：终态 UPDATE 加 WHERE status IN active，
      // 避免 signal 在 execute 返回后才 abort 把已落定的 completed 覆写成 cancelled。
      // 与 cancelRunById 的条件 UPDATE 对齐。
      db.update(agentRuns)
        .set({ status: 'cancelled', finishedAt, error: result.error ?? null })
        .where(
          and(
            eq(agentRuns.id, runRow.id),
            inArray(agentRuns.status, ['running', 'queued']),
          ),
        )
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
    // A1 修复（审计）：加 WHERE status IN active，防 cancelled 后被覆写成 completed。
    db.update(agentRuns)
      .set({ status: 'completed', finishedAt, error: null })
      .where(
        and(
          eq(agentRuns.id, runRow.id),
          inArray(agentRuns.status, ['running', 'queued']),
        ),
      )
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
    const comment = toComment(cRow);
    eventBus.publish({ type: 'comment:created', comment });
    // S04：agent 终态 comment 的 mention 触发 worker 派发（spec §7.3 入口2）
    triggerFromComment(comment);
    const r = toAgentRun(
      db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!,
    );
    eventBus.publish({ type: 'run:completed', run: r });

    // S09：成功 run 才写记忆（失败/取消路径禁止调用）
    try {
      const issueRow = db
        .select()
        .from(issues)
        .where(eq(issues.id, runRow.issueId))
        .get();
      if (issueRow) {
        memoryManager.syncRunCompleted({
          issue: {
            id: issueRow.id,
            identifier: issueRow.identifier,
            title: issueRow.title,
            description: issueRow.description,
          },
          run: {
            id: runRow.id,
            agentId: runRow.agentId,
            status: 'completed',
          },
          assistantText: finalText,
        });
      }
    } catch (e) {
      console.error('[memory] syncRunCompleted 包装失败:', e);
    }
  } catch (err) {
    clearRunAbort(runRow.id);
    await failRun(runRow.id, String(err));
  }
}

async function failRun(runId: string, error: string): Promise<void> {
  const finishedAt = Date.now();
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (row) {
    // A1 修复（审计）：加 WHERE status IN active，避免覆盖已落定的终态。
    db.update(agentRuns)
      .set({ status: 'failed', finishedAt, error })
      .where(
        and(
          eq(agentRuns.id, runId),
          inArray(agentRuns.status, ['running', 'queued']),
        ),
      )
      .run();
    const r = toAgentRun(
      db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get()!,
    );
    eventBus.publish({ type: 'run:failed', run: r });
  }
}
