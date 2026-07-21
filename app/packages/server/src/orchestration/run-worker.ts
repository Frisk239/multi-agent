import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  agentRuns,
  runMessages,
  comments,
  agents,
  issues,
  chatMessages,
  chatThreads,
} from '../db/schema.js';
import { toAgentRun, toRunMessage, toComment, toIssue } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { registerRunAbort, clearRunAbort } from './run-control.js';
import { touchRunHeartbeat } from './stale-runs.js';
import { notifyCommentCreated, notifyRunTerminal } from './inbox-writer.js';
import { getBackend } from '../runtime/registry.js';
import { resolveRunPrompt } from '../runtime/prompt.js';
import { triggerFromComment } from './comment-trigger.js';
import { memoryManager } from '../memory/manager.js';
import type { AgentEvent } from '../runtime/types.js';

// bu01：执行中 heartbeat 间隔（plan 锁定）
const HEARTBEAT_INTERVAL_MS = 5_000;

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

    // claim（条件 UPDATE queued→running）；bu01：同步写 lastHeartbeatAt
    const now = Date.now();
    db.update(agentRuns)
      .set({ status: 'running', startedAt: now, lastHeartbeatAt: now })
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
// bu03：resolveRunPrompt（QC 专用）；completed 但 QC 未 Link issue → fail。
async function executeRun(runRow: typeof agentRuns.$inferSelect): Promise<void> {
  // ADR 0003：env 优先，否则 DB root_path（apply 后通常已在 env）
  const { resolveWorkspaceCwd, applyWorkspaceCwdToProcess } = await import('../workspace-cwd.js');
  let cwdInfo = resolveWorkspaceCwd();
  if (!cwdInfo.configured || !cwdInfo.exists) {
    cwdInfo = applyWorkspaceCwdToProcess();
  }
  const cwd = cwdInfo.path;
  if (!cwd || !cwdInfo.exists) {
    await failRun(
      runRow.id,
      cwdInfo.configured
        ? `工作区路径无效: ${cwdInfo.path}`
        : '未配置 MA_WORKSPACE_CWD（可在 Settings 保存工作区路径）',
    );
    return;
  }
  // bu03：按 kind 选 prompt；QC 不走 issue buildPrompt
  const prompt = await resolveRunPrompt(runRow);
  if (!prompt) {
    const kind = (runRow.kind as string) ?? 'issue';
    await failRun(
      runRow.id,
      kind === 'quick_create'
        ? 'quick_create: 缺少 prompt'
        : kind === 'chat'
          ? 'chat: 缺少消息'
          : 'issue 不存在',
    );
    return;
  }

  // S05：claim 后查 agent.mcpServers，传进 ExecutionInput（claude-code 写临时文件 + --mcp-config）
  // G22：agent.model → backend --model
  const agentRow = db.select().from(agents).where(eq(agents.id, runRow.agentId)).get();
  const mcpServers = agentRow?.mcpServers ?? null;
  const model = agentRow?.model?.trim() ? agentRow.model.trim() : null;

  const signal = registerRunAbort(runRow.id);
  // bu01：执行中每 5s touch heartbeat；finally 必清
  const hb = setInterval(() => {
    touchRunHeartbeat(runRow.id);
  }, HEARTBEAT_INTERVAL_MS);
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
        issueId: runRow.issueId ?? null,
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
    eventBus.publish({
      type: 'run:message',
      message,
      issueId: runRow.issueId ?? null,
    });
  };

  // chat 默认 3min 硬超时，避免 opencode 挂起 → orphan after restart
  const kindForTimeout = (runRow.kind as string) ?? 'issue';
  const chatTimeoutMs =
    kindForTimeout === 'chat'
      ? Number(process.env.MA_CHAT_TIMEOUT_MS ?? 180_000)
      : undefined;

  try {
    const backend = getBackend(runRow.runtime);
    const result = await backend.execute(
      {
        prompt,
        cwd,
        issueId: runRow.issueId ?? null,
        agentId: runRow.agentId,
        runId: runRow.id,
        mcpServers, // S05：MCP 配置 JSON 字符串（null 则 backend 忽略）
        model, // G22：空则 CLI 默认
        timeoutMs: chatTimeoutMs && chatTimeoutMs > 0 ? chatTimeoutMs : null,
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

    // bu03：QC completed 但 issue 仍未 Link → 失败收口
    // agent-chat：chat 允许无 issue 完成
    const kind = (runRow.kind as 'issue' | 'quick_create' | 'chat') ?? 'issue';
    if (kind === 'quick_create') {
      const fresh = db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get();
      if (!fresh?.issueId) {
        await failRun(runRow.id, 'quick_create: issue not created');
        return;
      }
    }

    // completed —— 写终态；有 issueId 才写时间线 comment
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
    // 重新读 run（QC 可能已 Link issueId）
    const freshRun = db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!;
    const linkedIssueId = freshRun.issueId;

    // agent-chat：回写 assistant 消息到会话
    if (kind === 'chat' && freshRun.chatThreadId) {
      const mid = crypto.randomUUID();
      db.insert(chatMessages)
        .values({
          id: mid,
          threadId: freshRun.chatThreadId,
          role: 'assistant',
          body: finalText,
          runId: runRow.id,
          createdAt: finishedAt,
        })
        .run();
      db.update(chatThreads)
        .set({ updatedAt: finishedAt })
        .where(eq(chatThreads.id, freshRun.chatThreadId))
        .run();
    }

    if (linkedIssueId) {
      const cid = crypto.randomUUID();
      db.insert(comments)
        .values({
          id: cid,
          issueId: linkedIssueId,
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
      // QC 路径一般无 mention；issue run 保持原逻辑
      if (kind !== 'quick_create') {
        triggerFromComment(comment);
      }
      // bu01：agent 终态 comment 也进真 Inbox
      const issueForComment = db
        .select()
        .from(issues)
        .where(eq(issues.id, linkedIssueId))
        .get();
      if (issueForComment) {
        notifyCommentCreated(comment, toIssue(issueForComment));
      }
    }

    // 再读一次确保 status 已落库
    const rFinal = toAgentRun(
      db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!,
    );
    eventBus.publish({ type: 'run:completed', run: rFinal });
    // bu01：run 终态 → inbox（completed | failed；cancelled 不写）
    notifyRunTerminal(rFinal);

    // S09：成功 run 且有 issue 才写记忆（失败/取消路径禁止调用）
    if (linkedIssueId) {
      try {
        const issueRow = db
          .select()
          .from(issues)
          .where(eq(issues.id, linkedIssueId))
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
    }
  } catch (err) {
    clearRunAbort(runRow.id);
    await failRun(runRow.id, String(err));
  } finally {
    clearInterval(hb);
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
    // chat：失败也写一条 assistant 消息，避免 UI 只剩用户气泡 + 外部 fail card
    const kind = (row.kind as string) ?? 'issue';
    if (kind === 'chat' && row.chatThreadId) {
      const mid = crypto.randomUUID();
      const body = `【运行失败】${error || '未知错误'}\n\n可在运行详情查看完整信息，或重新发送消息。`;
      db.insert(chatMessages)
        .values({
          id: mid,
          threadId: row.chatThreadId,
          role: 'assistant',
          body,
          runId,
          createdAt: finishedAt,
        })
        .run();
      db.update(chatThreads)
        .set({ updatedAt: finishedAt })
        .where(eq(chatThreads.id, row.chatThreadId))
        .run();
    }
    eventBus.publish({ type: 'run:failed', run: r });
    // bu01：失败终态 → inbox
    notifyRunTerminal(r);
  }
}
