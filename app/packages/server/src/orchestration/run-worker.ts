import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  agentRuns,
  runMessages,
  comments,
  agents,
  issues,
  projects,
  chatMessages,
  chatThreads,
} from '../db/schema.js';
// chatThreads used for B1 chat project cwd
import { toAgentRun, toRunMessage, toComment, toIssue } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { registerRunAbort, clearRunAbort } from './run-control.js';
import { touchRunHeartbeat } from './stale-runs.js';
import { notifyCommentCreated, notifyRunTerminal } from './inbox-writer.js';
import { getBackend } from '../runtime/registry.js';
import { resolveRunPrompt } from '../runtime/prompt.js';
import {
  finalizeSessionFields,
  resolvePriorSession,
} from '../runtime/session-resume.js';
import { triggerFromComment } from './comment-trigger.js';
import { memoryManager } from '../memory/manager.js';
import { recordActivityLog } from './activity-logger.js';
import type { AgentEvent } from '../runtime/types.js';
import type { AgentRun, AgentRunFailureReason } from '@ma/shared';
import {
  enrichRunRowWithPathLock,
  normalizePathLockKey,
  shouldDeferClaimForPath,
  stampProjectLocalCwdPreview,
} from './path-lock.js';
import {
  clearToolInflight,
  noteToolEnd,
  noteToolStart,
} from './tool-watchdog-state.js';

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

// tick —— 遍历 queued / waiting_local_directory，对每个检查其 agent 的 per-agent 槽位（active running < agent.concurrency），
// 可用的 claim 并 fire-and-forget 执行（不 await，多个 run 并发）。
// C1：project_local 同 path 同时仅 1 个 running；被挡显示为 waiting_local_directory。
async function tick(): Promise<void> {
  const queuedRows = db
    .select()
    .from(agentRuns)
    .where(inArray(agentRuns.status, ['queued', 'waiting_local_directory']))
    .orderBy(asc(agentRuns.createdAt))
    .all();

  /** 本 tick 已 claim 的 project_local path key，防同批双开 */
  const claimedPathKeys = new Set<string>();

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

    // C1 path 闸：真仓被占用则跳过 claim，显式标记 waiting_local_directory 状态
    const pathGate = shouldDeferClaimForPath(queued, claimedPathKeys);
    if (pathGate.defer) {
      stampProjectLocalCwdPreview(queued.id, pathGate.path);
      const holderId = pathGate.holder?.id ?? 'pending-claim';

      if (queued.status !== 'waiting_local_directory') {
        const now = Date.now();
        db.update(agentRuns)
          .set({
            status: 'waiting_local_directory',
            lastHeartbeatAt: now,
            cwdPath: pathGate.path,
            cwdMode: 'project_local',
          })
          .where(and(eq(agentRuns.id, queued.id), eq(agentRuns.status, 'queued')))
          .run();

        const updatedRow = db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.id, queued.id))
          .get();
        if (updatedRow && updatedRow.status === 'waiting_local_directory') {
          const run = enrichRunRowWithPathLock(updatedRow, toAgentRun(updatedRow));
          eventBus.publish({ type: 'run:waiting_local_directory', run });
        }
      }

      eventBus.publish({
        type: 'run:progress',
        runId: queued.id,
        issueId: queued.issueId ?? null,
        text: `等待本机目录（被 run ${holderId.slice(0, 8)}… 占用）`,
      });
      continue;
    }
    if (pathGate.path) {
      stampProjectLocalCwdPreview(queued.id, pathGate.path);
    }

    // claim（条件 UPDATE queued/waiting_local_directory→running）；bu01：同步写 lastHeartbeatAt
    const now = Date.now();
    db.update(agentRuns)
      .set({ status: 'running', startedAt: now, lastHeartbeatAt: now })
      .where(
        and(
          eq(agentRuns.id, queued.id),
          inArray(agentRuns.status, ['queued', 'waiting_local_directory']),
        ),
      )
      .run();
    const runRow = db.select().from(agentRuns).where(eq(agentRuns.id, queued.id)).get();
    if (!runRow || runRow.status !== 'running') continue; // 没抢到（被别的 tick 抢）

    if (pathGate.path) {
      claimedPathKeys.add(normalizePathLockKey(pathGate.path));
    }

    const run = enrichRunRowWithPathLock(runRow, toAgentRun(runRow));
    eventBus.publish({ type: 'run:running', run });

    // fire-and-forget 并发执行（不 await）
    void executeRun(runRow);
  }
}

// executeRun —— 单个 run 的完整执行（从 S03 tick 内部提取，支持并发）。
// bu03：resolveRunPrompt（QC 专用）；completed 但 QC 未 Link issue → fail。
  async function executeRun(runRow: typeof agentRuns.$inferSelect): Promise<void> {
    // Multica execenv：默认隔离；有 project.localPath 则本机仓；opt-in 全局 workspace
    // B1：chat 从 chat_thread.projectId 读 localPath
    const kindEarly = (runRow.kind as string) ?? 'issue';
    let projectLocalPath: string | null = null;
    if (kindEarly === 'chat' && runRow.chatThreadId) {
      const thr = db
        .select()
        .from(chatThreads)
        .where(eq(chatThreads.id, runRow.chatThreadId))
        .get();
      if (thr?.projectId) {
        const proj = db
          .select()
          .from(projects)
          .where(eq(projects.id, thr.projectId))
          .get();
        projectLocalPath = proj?.localPath ?? null;
      }
    } else if (kindEarly === 'quick_create' && runRow.projectId) {
      // B2：QC 无 issue 时用 run.projectId
      const proj = db
        .select()
        .from(projects)
        .where(eq(projects.id, runRow.projectId))
        .get();
      projectLocalPath = proj?.localPath ?? null;
    } else if (runRow.issueId && kindEarly !== 'chat') {
      const issueRow = db
        .select()
        .from(issues)
        .where(eq(issues.id, runRow.issueId))
        .get();
      if (issueRow?.projectId) {
        const proj = db
          .select()
          .from(projects)
          .where(eq(projects.id, issueRow.projectId))
          .get();
        projectLocalPath = proj?.localPath ?? null;
      }
    }
    let priorCwdPath: string | null = null;
    let priorCwdMode: string | null = null;
    if (runRow.rerunOfRunId) {
      const priorRun = db.select().from(agentRuns).where(eq(agentRuns.id, runRow.rerunOfRunId)).get();
      if (priorRun?.cwdPath && priorRun?.cwdMode) {
        priorCwdPath = priorRun.cwdPath;
        priorCwdMode = priorRun.cwdMode;
      }
    }

    const { resolveRunCwd } = await import('../runtime/resolve-run-cwd.js');
    const cwdInfo = resolveRunCwd({
      kind: kindEarly,
      runId: runRow.id,
      issueId: runRow.issueId ?? null,
      chatThreadId: runRow.chatThreadId ?? null,
      projectLocalPath,
      priorCwdPath,
      priorCwdMode,
    });
    const cwd = cwdInfo.path;
    // A2：落库 cwd 审计（成功或失败路径均写，便于 UI「跑在哪」）
    try {
      db.update(agentRuns)
        .set({
          cwdPath: cwd ?? projectLocalPath ?? null,
          cwdMode: cwdInfo.mode,
        })
        .where(eq(agentRuns.id, runRow.id))
        .run();
    } catch {
      /* ignore write race */
    }
    if (!cwd || !cwdInfo.exists) {
      await failRun(
        runRow.id,
        cwdInfo.error ??
          (projectLocalPath
            ? `项目本机路径不可用: ${projectLocalPath}`
            : '无法准备隔离工作目录（~/.multi-agent/...）'),
      );
      return;
    }

  // DS1：execute 前解析 prior session（ADR 0004）
  const priorSession = resolvePriorSession({
    id: runRow.id,
    runtime: runRow.runtime,
    agentId: runRow.agentId,
    issueId: runRow.issueId ?? null,
    chatThreadId: runRow.chatThreadId ?? null,
    kind: (runRow.kind as string) ?? 'issue',
    rerunOfRunId: runRow.rerunOfRunId ?? null,
  });
  try {
    db.update(agentRuns)
      .set({
        resumedSessionId: priorSession.resumeSessionId,
        sessionResumeStatus: priorSession.status,
      })
      .where(eq(agentRuns.id, runRow.id))
      .run();
  } catch {
    /* ignore */
  }
  // bu03：按 kind 选 prompt；QC 不走 issue buildPrompt
  // DS1：真 resume 时 chat 不塞假历史
  const prompt = await resolveRunPrompt(runRow, {
    skipChatHistoryForResume: Boolean(priorSession.resumeSessionId),
    priorSessionId: priorSession.resumeSessionId,
  });
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
  // DS4：agent.thinkingLevel → backend --effort/--variant（能传则传）
  // G22 residual：把本 run 使用的 model/thinking 快照到 agent_run（agent 后改不影响历史）
  const agentRow = db.select().from(agents).where(eq(agents.id, runRow.agentId)).get();
  const mcpServers = agentRow?.mcpServers ?? null;
  const model = agentRow?.model?.trim() ? agentRow.model.trim() : null;
  const thinkingLevel = agentRow?.thinkingLevel?.trim()
    ? agentRow.thinkingLevel.trim()
    : null;
  try {
    db.update(agentRuns)
      .set({ model, thinkingLevel })
      .where(eq(agentRuns.id, runRow.id))
      .run();
  } catch {
    /* ignore write race */
  }

  if (runRow.issueId) {
    recordActivityLog({
      issueId: runRow.issueId,
      actorType: 'agent',
      actorId: runRow.agentId,
      actorName: agentRow?.name ?? 'Agent',
      eventType: 'run_started',
      payload: { runId: runRow.id, runtime: runRow.runtime },
    });
  }

  const signal = registerRunAbort(runRow.id);
  const kindForTimeout = (runRow.kind as string) ?? 'issue';
  // F3：chat 保留 5s 进程 pulse（防 worker 假死）；issue/QC 仅事件 touch（idle 语义）
  const useProcessPulse = kindForTimeout === 'chat';
  const hb = useProcessPulse
    ? setInterval(() => {
        touchRunHeartbeat(runRow.id);
      }, HEARTBEAT_INTERVAL_MS)
    : null;
  let seq = 0;
  const nextSeq = () => ++seq;

  // onEvent —— Backend 事件分流（spec §6.2 + §3.4 comment 分工）：
  //   progress/log/delta → run:progress only（不进 DB）
  //   message/tool_* → run_message + run:message 事件
  //   任意事件 → touch heartbeat（issue idle 续命）
  const onEvent = (e: AgentEvent) => {
    touchRunHeartbeat(runRow.id);
    // C2：tool in-flight 深度 → stale sweeper 用 tool 窗口
    if (e.type === 'tool_start') {
      noteToolStart(runRow.id, e.name);
    } else if (e.type === 'tool_end') {
      noteToolEnd(runRow.id, e.name);
    }
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

  // 超时：chat 默认 15min wall；issue 默认无 wall（MA_ISSUE_TIMEOUT_MS），idle 见 stale sweeper
  const { getIssueWallTimeoutMs } = await import('./stale-runs.js');
  let wallTimeoutMs: number | null = null;
  if (kindForTimeout === 'chat') {
    const chatTimeoutRaw = process.env.MA_CHAT_TIMEOUT_MS;
    const chatTimeoutMs = Number(
      chatTimeoutRaw === undefined || chatTimeoutRaw === ''
        ? 900_000
        : chatTimeoutRaw,
    );
    wallTimeoutMs = chatTimeoutMs > 0 ? chatTimeoutMs : null;
  } else {
    const issueWall = getIssueWallTimeoutMs();
    wallTimeoutMs = issueWall > 0 ? issueWall : null;
  }

  try {
    // DS1：启动前日志（真 resume / fresh / poison）
    if (runRow.rerunOfRunId) {
      onEvent({
        type: 'log',
        text: `[session] Resuming environment from prior run ${runRow.rerunOfRunId.slice(0, 12)}\n`,
      });
    }

    if (priorSession.resumeSessionId) {
      onEvent({
        type: 'log',
        text: `[session] resume ${priorSession.resumeSessionId.slice(0, 12)}… (${priorSession.reason})\n`,
      });
    } else if (priorSession.status === 'poison_fresh') {
      onEvent({
        type: 'log',
        text: `[session] poison→fresh (${priorSession.reason})\n`,
      });
    } else if (priorSession.status === 'unsupported') {
      onEvent({
        type: 'log',
        text: `[session] unsupported for runtime ${runRow.runtime}（仅 workdir/假历史）\n`,
      });
    }

    // G22 residual：执行前诚实 log（与落库快照一致）
    onEvent({
      type: 'log',
      text: `[model] ${model ?? 'default'}\n`,
    });
    onEvent({
      type: 'log',
      text: `[thinking] ${thinkingLevel ?? 'default'}\n`,
    });

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
        thinkingLevel, // DS4：空则 CLI 默认
        timeoutMs: wallTimeoutMs,
        resumeSessionId: priorSession.resumeSessionId, // DS1
      },
      onEvent,
      signal,
    );
    clearRunAbort(runRow.id);
    const finishedAt = Date.now();
    // DS4：有 usage 则落库（终态任意；失败/取消也尽量保留）
    const tokenPatch = {
      tokensInput: result.usage?.input ?? null,
      tokensOutput: result.usage?.output ?? null,
      tokensCacheRead: result.usage?.cacheRead ?? null,
      tokensCacheWrite: result.usage?.cacheWrite ?? null,
    } as const;
    const hasTokens =
      tokenPatch.tokensInput != null ||
      tokenPatch.tokensOutput != null ||
      tokenPatch.tokensCacheRead != null ||
      tokenPatch.tokensCacheWrite != null;

    // DS1：session 终态字段
    const sessionPatch = finalizeSessionFields({
      planned: priorSession,
      emittedSessionId: result.providerSessionId,
      exitReason:
        result.exitReason === 'cancelled' || signal.aborted
          ? 'cancelled'
          : result.exitReason,
      errorText: result.error ?? null,
    });

    if (result.exitReason === 'cancelled' || signal.aborted) {
      // A1 修复（审计）：终态 UPDATE 加 WHERE status IN active，
      // 避免 signal 在 execute 返回后才 abort 把已落定的 completed 覆写成 cancelled。
      // 与 cancelRunById 的条件 UPDATE 对齐。
      db.update(agentRuns)
        .set({
          status: 'cancelled',
          finishedAt,
          error: result.error ?? null,
          ...(hasTokens ? tokenPatch : {}),
          ...sessionPatch,
        })
        .where(
          and(
            eq(agentRuns.id, runRow.id),
            inArray(agentRuns.status, ['running', 'queued', 'waiting_local_directory']),
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
      if (runRow.issueId) {
        recordActivityLog({
          issueId: runRow.issueId,
          actorType: 'agent',
          actorId: runRow.agentId,
          actorName: agentRow?.name ?? 'Agent',
          eventType: 'run_failed',
          payload: { runId: runRow.id, error: result.error },
        });
      }
      db.update(agentRuns)
        .set({
          ...(hasTokens ? tokenPatch : {}),
          ...sessionPatch,
        })
        .where(eq(agentRuns.id, runRow.id))
        .run();
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
      .set({
        status: 'completed',
        finishedAt,
        error: null,
        ...(hasTokens ? tokenPatch : {}),
        ...sessionPatch,
      })
      .where(
        and(
          eq(agentRuns.id, runRow.id),
          inArray(agentRuns.status, ['running', 'queued', 'waiting_local_directory']),
        ),
      )
      .run();
    const finalText = result.finalText || '(无输出)';
    // 重新读 run（QC 可能已 Link issueId）
    const freshRun = db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!;
    const linkedIssueId = freshRun.issueId;

    if (linkedIssueId) {
      recordActivityLog({
        issueId: linkedIssueId,
        actorType: 'agent',
        actorId: runRow.agentId,
        actorName: agentRow?.name ?? 'Agent',
        eventType: 'run_completed',
        payload: { runId: runRow.id },
      });
    }

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
        .set({
          updatedAt: finishedAt,
          ...(sessionPatch.providerSessionId ? { lastSessionId: sessionPatch.providerSessionId } : {}),
        })
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
        await triggerFromComment(comment);
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
          // 发送系统消息
          const mid = crypto.randomUUID();
          const msSeq = nextSeq();
          const msCreatedAt = Date.now();
          db.insert(runMessages)
            .values({ id: mid, runId: runRow.id, seq: msSeq, kind: 'system', body: '[memory] 自动沉淀经验到 Memory 库', createdAt: msCreatedAt })
            .run();
          eventBus.publish({
            type: 'run:message',
            message: toRunMessage({ id: mid, runId: runRow.id, seq: msSeq, kind: 'system', body: '[memory] 自动沉淀经验到 Memory 库', createdAt: msCreatedAt }),
            issueId: runRow.issueId ?? null,
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
    if (hb) clearInterval(hb);
    clearToolInflight(runRow.id);
    wakeRunWorker();
  }
}

function inferFailureReason(error: string): AgentRunFailureReason {
  const l = error.toLowerCase();
  if (l.includes('tool watchdog') || l.includes('tool_watchdog')) return 'tool_watchdog';
  if (l.includes('idle')) return 'idle_watchdog';
  if (l.includes('heartbeat') || l.includes('orphan')) return 'stale_heartbeat';
  if (l.includes('timeout') || l.includes('timed out')) return 'timeout';
  return 'exec_error';
}

export async function failRun(
  runId: string,
  error: string,
  failureReason?: AgentRun['failureReason'],
): Promise<void> {
  const finishedAt = Date.now();
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (row) {
    const reason = failureReason ?? inferFailureReason(error);
    // A1 修复（审计）：加 WHERE status IN active，避免覆盖已落定的终态。
    db.update(agentRuns)
      .set({ status: 'failed', finishedAt, error, failureReason: reason })
      .where(
        and(
          eq(agentRuns.id, runId),
          inArray(agentRuns.status, ['running', 'queued', 'waiting_local_directory']),
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
    wakeRunWorker();
  }
}
