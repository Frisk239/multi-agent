import { eq, and, asc, sql, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  agentRuns,
  runMessages,
  comments,
  issues,
  projects,
  chatMessages,
  chatThreads,
  workspaces,
} from '../db/schema.js';
// chatThreads used for B1 chat project cwd
import { toAgentRun, toObservedAgentRun, toRunMessage, toComment, toIssue } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { registerRunAbort, clearRunAbort } from './run-control.js';
import {
  getPrepareLeaseMs,
  touchRunHeartbeat,
} from './stale-runs.js';
import { notifyCommentCreated, notifyRunTerminal } from './inbox-writer.js';
import { getBackend } from '../runtime/registry.js';
import { parseAgentCustomArgs, resolveAgentEnvVarsForExecution } from '../runtime/agent-inject.js';
import {
  inspectMcpEnvReferences,
  parseMcpServers,
  validateMcpConfig,
} from '../runtime/mcp-config.js';
import { scrubSecretValue, scrubSecrets, StreamSecretScrubber } from '../runtime/secret-scrubber.js';
import { StreamScrubber, scrubFences } from '../runtime/stream-scrubber.js';
import { resolveRunPrompt } from '../runtime/prompt.js';
import {
  finalizeSessionFields,
  resolvePriorSession,
} from '../runtime/session-resume.js';
import { normalizeRuntimeEvent } from '../runtime/event-normalizer.js';
import { triggerFromComment } from './comment-trigger.js';
import { memoryManager } from '../memory/manager.js';
import { recordActivityLog } from './activity-logger.js';
import type { AgentEvent } from '../runtime/types.js';
import { classifyFailure, type AgentRun, type AgentRunFailureReason } from '@ma/shared';
import {
  enrichRunRowWithPathLock,
  normalizePathLockKey,
  shouldDeferClaimForPath,
  stampProjectLocalCwdPreview,
} from './path-lock.js';
import {
  findSameIssueClaimHolder,
  sameIssueClaimGuard,
} from './followup-serial-claim.js';
import {
  clearToolInflight,
  noteToolEnd,
  noteToolStart,
} from './tool-watchdog-state.js';
import { logger } from '../logger.js';
import { parseAndDispatchSubagents } from './subagent-dispatch.js';
import {
  invokeWorkerTickSafely,
  markWorkerStarted,
  markWorkerStopped,
  trackWorkerTick,
} from '../process-health.js';
import {
  ACTIVE_RUN_STATUSES,
  CLAIMABLE_RUN_STATUSES,
  transitionRun,
} from './run-transitions.js';
import { hasActiveAutoRetryChild, transitionAndScheduleAutoRetry } from './auto-retry.js';
import { clearExecutionOwnership, recordExecutionOwnership } from './execution-ownership.js';
import {
  agentDispatchableClaimGuard,
  checkAgentDispatchGate,
} from './agent-dispatch-gate.js';
import { cancelRunById } from './run-cancellation.js';

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
let stopped = false;

function combinedClaimGuard(row: typeof agentRuns.$inferSelect) {
  const serialGuard = sameIssueClaimGuard(row);
  const archiveGuard = agentDispatchableClaimGuard(row.agentId);
  return serialGuard ? and(serialGuard, archiveGuard) : archiveGuard;
}

/**
 * A stale worker snapshot can observe a queued row after its Agent has been
 * archived. Reuse normal cancellation so the record stays auditable and no
 * later worker/sweeper path can pick it up again.
 */
function cancelIfArchived(runId: string, agentId: string): boolean {
  const gate = checkAgentDispatchGate(agentId);
  if (gate.ok || gate.reason !== 'agent_archived') return false;
  cancelRunById(runId);
  return true;
}

function tickSafe(): void {
  invokeWorkerTickSafely(
    () => tick(),
    (err) => {
      // logger 保留完整 Error；process-health 只投影安全、限长摘要。
      logger.error({ err }, '[run-worker] tick failed');
    },
  );
}

export function startRunWorker(): void {
  if (timer) return;
  stopped = false;
  markWorkerStarted('runWorker');
  timer = setInterval(tickSafe, 500);
}

/** Slice 23：关停时清 timer，阻止 wake 再 claim */
export function stopRunWorker(): void {
  stopped = true;
  markWorkerStopped('runWorker');
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function wakeRunWorker(): void {
  if (stopped) return;
  tickSafe();
}

// tick —— 遍历 queued / waiting_local_directory，对每个检查其 agent 的 per-agent 槽位（active running < agent.concurrency），
// 可用的 claim 并 fire-and-forget 执行（不 await，多个 run 并发）。
// C1：project_local 同 path 同时仅 1 个 running；被挡显示为 waiting_local_directory。
// W5：导出 tick 供故障注入测试直接驱动（生产入口 startRunWorker 不变）
export async function tick(): Promise<void> {
  if (stopped) return;
  await trackWorkerTick('runWorker', runTickWork);
}

function runTickWork(): void {
  const queuedRows = db
    .select()
    .from(agentRuns)
    .where(
      and(
        inArray(agentRuns.status, ['queued', 'waiting_local_directory']),
        // Auto-retry children with a backoff remain queued but are not
        // claimable until their durable next_attempt_at is due.
        or(isNull(agentRuns.nextAttemptAt), lte(agentRuns.nextAttemptAt, Date.now())),
      ),
    )
    // G6-1：认领按优先级公平（学 multica ClaimAgentTask `ORDER BY atq.priority
    // DESC, atq.created_at ASC`）；priority 是文本 enum，用 CASE 映射数值序：
    // urgent(0) > high(1) > medium(2) > low(3) > none/未知(4)，同级仍 FCFS
    .orderBy(
      sql<number>`CASE ${agentRuns.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
      asc(agentRuns.createdAt),
    )
    .all();

  /** 本 tick 已 claim 的 project_local path key，防同批双开 */
  const claimedPathKeys = new Set<string>();

  // G2-5：全局在途并发配额（workspace.max_concurrent_runs；null=不限）。
  // 每 tick 循环外一次查询作基数；本 tick 内成功 claim 用本地计数累加，
  // 不在循环里重复查 DB（better-sqlite3 同步写，claim 后计数即真实）。
  const DEFAULT_WS_ID = 'ws-local';
  const wsRow = db.select().from(workspaces).where(eq(workspaces.id, DEFAULT_WS_ID)).get();
  const globalMax = wsRow?.maxConcurrentRuns ?? null;
  const globalActive = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .get();
  let claimedThisTick = 0;

  for (const queued of queuedRows) {
    // Archive is a lifecycle hard stop. It is checked before any slot/path
    // work and again in the claim UPDATE below; MA_ENQUEUE_ALLOW_NOT_READY is
    // deliberately irrelevant in a worker.
    const dispatchGate = checkAgentDispatchGate(queued.agentId);
    if (!dispatchGate.ok) {
      if (dispatchGate.reason === 'agent_archived') cancelRunById(queued.id);
      continue;
    }
    const agent = dispatchGate.agent;
    const activeCount = db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(agentRuns)
      .where(
        and(eq(agentRuns.agentId, queued.agentId), eq(agentRuns.status, 'running')),
      )
      .get();
    if ((activeCount?.cnt ?? 0) >= agent.concurrency) continue; // 该 agent 槽满，跳过

    // Follow-up serial claim: Agent 并发额度大于 1 时，同一 Issue 的下一轮
    // 仍须等待当前轮。先在读路径短路，避免它被 path gate 误标成「等目录」；
    // 真正的并发安全仍由下方同一 UPDATE 内的 NOT EXISTS 守卫保证。
    if (findSameIssueClaimHolder(queued)) continue;

    // C1 path 闸：真仓被占用则跳过 claim，显式标记 waiting_local_directory 状态
    const pathGate = shouldDeferClaimForPath(queued, claimedPathKeys);
    if (pathGate.defer) {
      stampProjectLocalCwdPreview(queued.id, pathGate.path);
      const holderId = pathGate.holder?.id ?? 'pending-claim';

      if (queued.status !== 'waiting_local_directory') {
        const now = Date.now();
        const waitTr = transitionRun({
          id: queued.id,
          fromStatuses: ['queued'],
          // 若另一个 tick 恰在 path 探测后 claim 了同 scope 的前一轮，
          // 保持 queued，让 serial wait 的读取投影如实说明原因。
          additionalGuard: combinedClaimGuard(queued),
          patch: {
            status: 'waiting_local_directory',
            lastHeartbeatAt: now,
            // Slice 66：进入 waiting 写墙钟；离开时清 null
            waitingLocalEnteredAt: now,
            cwdPath: pathGate.path,
            cwdMode: 'project_local',
          },
        });
        if (waitTr.applied && waitTr.row) {
          const run = enrichRunRowWithPathLock(waitTr.row, toObservedAgentRun(waitTr.row));
          eventBus.publish({ type: 'run:waiting_local_directory', run });
        } else {
          continue;
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

    // G2-5：全局配额闸 —— 拦 claim（queued 保持排队），不拦 enqueue。
    // 基数=本 tick 开始时全局 running 数 + 本 tick 已 claim 数。
    if (globalMax !== null && (globalActive?.cnt ?? 0) + claimedThisTick >= globalMax) {
      continue;
    }

    // claim（条件 UPDATE queued/waiting_local_directory→running）；Slice 39：changes 判定
    // Slice 68：claim 时写 prepareLeaseExpiresAt；半 claim = running 且 lease 未清。
    // Multica 精神：dispatched+prepare_lease；本仓无 dispatched，用 lease 列标 prepare 窗。
    const now = Date.now();
    const prepareLeaseMs = getPrepareLeaseMs();
    const claimTr = transitionRun({
      id: queued.id,
      fromStatuses: CLAIMABLE_RUN_STATUSES,
      // DB 行即锁：不依赖上述读检查或 Node 内存时序。不同 agent / Issue
      // 不会命中此谓词，只有同 agent + same issue + issue kind 才串行。
      additionalGuard: combinedClaimGuard(queued),
      patch: {
        status: 'running',
        startedAt: now,
        lastHeartbeatAt: now,
        // Slice 66：离开 waiting 清进入时刻
        waitingLocalEnteredAt: null,
        nextAttemptAt: null,
        // Slice 68：prepare 窗；0=关闭 lease（不写）
        prepareLeaseExpiresAt:
          prepareLeaseMs > 0 ? now + prepareLeaseMs : null,
      },
    });
    if (!claimTr.applied || !claimTr.row || claimTr.row.status !== 'running') {
      // Archive may have won the same DB race that made the claim guard fail.
      // Best-effort close the old row now; if another transition won instead,
      // cancelRunById is idempotently a no-op.
      cancelIfArchived(queued.id, queued.agentId);
      continue; // 没抢到（被别的 tick 抢）
    }
    const runRow = claimTr.row;
    claimedThisTick += 1; // G2-5：本 tick 内 claim 计数（配额闸本地累加，不重复查 DB）

    if (pathGate.path) {
      claimedPathKeys.add(normalizePathLockKey(pathGate.path));
    }

    const run = enrichRunRowWithPathLock(runRow, toObservedAgentRun(runRow));
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
  // Slice 67：enqueue 时 sessionResumeStatus=force_fresh → 跳过 resume
  const priorSession = resolvePriorSession({
    id: runRow.id,
    runtime: runRow.runtime,
    agentId: runRow.agentId,
    issueId: runRow.issueId ?? null,
    chatThreadId: runRow.chatThreadId ?? null,
    kind: (runRow.kind as string) ?? 'issue',
    rerunOfRunId: runRow.rerunOfRunId ?? null,
    sessionResumeStatus:
      (runRow as { sessionResumeStatus?: string | null }).sessionResumeStatus ?? null,
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
  // G3-4b：agent.env_vars / custom_args → ExecutionInput（spawn env 合并 + CLI argv 注入）
  // A run can be claimed and then await prompt/cwd preparation while an
  // operator archives its Agent. Re-read the lifecycle immediately before
  // executor setup: archive turns the running row cancelled (and later aborts
  // a registered controller), never into a CLI launch.
  const executionGate = checkAgentDispatchGate(runRow.agentId);
  if (!executionGate.ok) {
    if (executionGate.reason === 'agent_archived') {
      cancelRunById(runRow.id);
      return;
    }
    await failRun(runRow.id, executionGate.detail);
    return;
  }
  const agentRow = executionGate.agent;
  const mcpServers = agentRow?.mcpServers ?? null;
  const mcpValidation = validateMcpConfig(mcpServers);
  if (!mcpValidation.ok) {
    await failRun(runRow.id, `MCP 配置无效：${mcpValidation.error}`);
    return;
  }
  const canonicalMcpServers = mcpServers?.trim() ? mcpValidation.canonical : null;
  // G8-3：在任何 backend / 临时 MCP 文件启动前，先确认敏感引用都能从
  // 宿主环境解析。安全凭据不能用空串或静默缺失去碰运气认证。
  const envResolution = resolveAgentEnvVarsForExecution(agentRow?.envVars ?? null);
  if (!envResolution.ok) {
    await failRun(runRow.id, envResolution.error, 'missing_required_env_ref');
    return;
  }
  if (envResolution.missingOptionalRefs.length > 0) {
    logger.warn(
      {
        runId: runRow.id,
        refs: envResolution.missingOptionalRefs,
      },
      'optional agent env references are missing; omitted from CLI launch',
    );
  }
  if (canonicalMcpServers) {
    const mcpRefs = inspectMcpEnvReferences(parseMcpServers(canonicalMcpServers));
    if (mcpRefs.missingRequiredRefs.length > 0) {
      const first = mcpRefs.missingRequiredRefs[0]!;
      await failRun(
        runRow.id,
        `宿主环境缺少 ${first.envRef}（供 MCP ${first.path} 使用），未启动 CLI`,
        'missing_required_env_ref',
      );
      return;
    }
    if (mcpRefs.missingOptionalRefs.length > 0) {
      logger.warn(
        { runId: runRow.id, refs: mcpRefs.missingOptionalRefs },
        'optional MCP env references are missing; backend will use its legacy best-effort behavior',
      );
    }
  }
  const model = agentRow?.model?.trim() ? agentRow.model.trim() : null;
  const thinkingLevel = agentRow?.thinkingLevel?.trim()
    ? agentRow.thinkingLevel.trim()
    : null;
  const envVars = envResolution.envVars;
  const customArgs = parseAgentCustomArgs(agentRow?.customArgs ?? null);
  const backend = getBackend(runRow.runtime);
  if (canonicalMcpServers && backend.supportsMcpConfig !== true) {
    await failRun(
      runRow.id,
      `runtime ${backend.label} 不支持 Agent 级 MCP 配置；请清空 MCP 或切换到支持 MCP 的 runtime`,
    );
    return;
  }
  if (customArgs?.length && backend.supportsCustomArgs !== true) {
    await failRun(
      runRow.id,
      `runtime ${backend.label} 不支持 Agent 自定义 CLI 参数；请清空 customArgs 或切换 runtime`,
    );
    return;
  }
  try {
    db.update(agentRuns)
      .set({ model, thinkingLevel })
      .where(eq(agentRuns.id, runRow.id))
      .run();
  } catch {
    /* ignore write race */
  }

  // Slice 68：prepare 期间可能被 prepare_lease sweeper / cancel 抢终态；spawn 前复核
  {
    const live = db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get();
    if (!live || live.status !== 'running') {
      return;
    }
    // Keep the lifecycle condition adjacent to the final pre-spawn state
    // check. This covers an archive that lands after the first gate but before
    // AbortController registration, where there is intentionally no CLI yet.
    if (cancelIfArchived(runRow.id, runRow.agentId)) return;
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
  // Slice 68：abort 已 register = 稳定 running；清 prepare lease（半 claim 结束）
  try {
    db.update(agentRuns)
      .set({ prepareLeaseExpiresAt: null })
      .where(and(eq(agentRuns.id, runRow.id), eq(agentRuns.status, 'running')))
      .run();
  } catch {
    /* ignore write race */
  }
  // 清 lease 后再核一次：若 sweeper 已 fail，不进 executor
  {
    const live = db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get();
    if (!live || live.status !== 'running') {
      clearRunAbort(runRow.id);
      return;
    }
  }
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

  const toolStartTime = new Map<string, number>();

  // G4-2：流式围栏 scrubber（per-run；CLI 回显 user prompt 时剥系统注入的
  // <retrieved-context>/<context-fence>/<think> 围栏，防漏进 UI 与回放）
  const scrubber = new StreamScrubber();
  // G8-5：密钥流状态与 memory/think 围栏独立。message delta 与 log 可能交错，
  // 所以各有自己的 pending tail，避免把两个来源拼成错误的 token。
  const messageSecretScrubber = new StreamSecretScrubber();
  const logSecretScrubber = new StreamSecretScrubber();
  const publishStreamText = (kind: 'text' | 'thinking', text: string): void => {
    if (!text) return;
    eventBus.publish({
      type: 'run:progress',
      runId: runRow.id,
      issueId: runRow.issueId ?? null,
      text,
    });
    eventBus.publish({
      type: 'run:stream_chunk',
      runId: runRow.id,
      kind,
      content: text,
    });
  };

  // onEvent —— Backend 事件分流（spec §6.2 + §3.4 comment 分工）：
  //   progress/log/delta → run:progress only（不进 DB）
  //   message/tool_* → run_message + run:message 事件
  //   任意事件 → touch heartbeat（issue idle 续命）
  const onEvent = (e: AgentEvent) => {
    touchRunHeartbeat(runRow.id);
    // C2：tool in-flight 深度 → stale sweeper 用 tool 窗口
    if (e.type === 'tool_start') {
      noteToolStart(runRow.id, e.name);
      toolStartTime.set(e.name, Date.now());
      const rEvent = normalizeRuntimeEvent({
        runId: runRow.id,
        type: 'tool_start',
        toolName: e.name,
        input: scrubSecretValue(e.args),
      });
      eventBus.publish({ type: 'runtime:event', event: rEvent });
    } else if (e.type === 'tool_end') {
      noteToolEnd(runRow.id, e.name);
      const start = toolStartTime.get(e.name);
      const duration = start ? Date.now() - start : undefined;
      toolStartTime.delete(e.name);
      const rEvent = normalizeRuntimeEvent({
        runId: runRow.id,
        type: 'tool_end',
        toolName: e.name,
        output: scrubSecretValue(e.result),
        duration,
      });
      eventBus.publish({ type: 'runtime:event', event: rEvent });
    }
    if (e.type === 'message_delta' || e.type === 'log') {
      // G4-2：流式 delta 过 scrubber（有状态跨 chunk；被剥内容不发布）
      const visible = e.type === 'message_delta' ? scrubber.feed(e.text) : e.text;
      const safeVisible = e.type === 'message_delta'
        ? messageSecretScrubber.feed(visible)
        : logSecretScrubber.feed(visible);
      publishStreamText(e.type === 'log' ? 'thinking' : 'text', safeVisible);
      return;
    }
    let kind: 'assistant' | 'user' | 'tool_start' | 'tool_end' | 'system' = 'system';
    let body = '';
    if (e.type === 'message') {
      kind = e.role === 'user' ? 'user' : 'assistant';
      // G4-2：整条消息一次性剥围栏（user 回显含完整 prompt 围栏）
      body = scrubSecrets(scrubFences(e.text));
    } else if (e.type === 'tool_start') {
      kind = 'tool_start';
      body = scrubSecrets(JSON.stringify({ name: e.name, args: scrubSecretValue(e.args ?? null) }));
    } else if (e.type === 'tool_end') {
      kind = 'tool_end';
      // Defensive second pass keeps the DB transcript safe even if a backend
      // already converted a structured result to a string before this boundary.
      body = scrubSecrets(JSON.stringify({ name: e.name, result: scrubSecretValue(e.result ?? '') }));
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

  // G8-2：每个 backend 在真正拿到 child PID 时调用。采样/写库失败不阻止
  // 现有执行，但会使未来重启严格降级为「不自动杀」而不是按 PID 猜测。
  const onProcessStarted = (pid: number) => {
    try {
      const owner = recordExecutionOwnership(runRow.id, pid, cwd);
      if (!owner.recorded) {
        logger.warn(
          { runId: runRow.id, pid, reason: owner.reason },
          'run execution ownership was not persisted; crash recovery will fail closed',
        );
      }
    } catch (err) {
      logger.warn(
        { runId: runRow.id, pid, err: err instanceof Error ? err.message : String(err) },
        'run execution ownership write failed; crash recovery will fail closed',
      );
    }
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

  // `await import()` above is a real yield: an archive can win after the
  // prepare check but before backend.execute. The AbortSignal check protects
  // the already-registered controller; the DB + lifecycle re-read protects a
  // controller-less/old snapshot. Either case must return before any CLI is
  // started.
  const beforeExecute = db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get();
  if (
    signal.aborted ||
    !beforeExecute ||
    beforeExecute.status !== 'running' ||
    cancelIfArchived(runRow.id, runRow.agentId)
  ) {
    clearRunAbort(runRow.id);
    return;
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

    if (prompt.includes('# Memory Context')) {
      onEvent({
        type: 'log',
        text: `[memory] Auto-injected relevant memory context into prompt\n`,
      });
    }

    // G22 residual：执行前诚实 log（与落库快照一致）
    onEvent({
      type: 'log',
      text: `[model] ${model ?? 'default'}\n`,
    });
    if (backend.supportsThinkingLevel === true && thinkingLevel) {
      onEvent({
        type: 'log',
        text: `[thinking] ${thinkingLevel}\n`,
      });
    }
    // G3-4b：注入前诚实 log（与 agent 行配置一致）
    if (envVars) {
      onEvent({
        type: 'log',
        text: `[env] 注入 ${Object.keys(envVars).length} 个环境变量\n`,
      });
    }
    if (customArgs?.length) {
      onEvent({
        type: 'log',
        text: `[args] 注入 ${customArgs.length} 个自定义 CLI 参数\n`,
      });
    }

    const result = await backend.execute(
      {
        prompt,
        cwd,
        issueId: runRow.issueId ?? null,
        agentId: runRow.agentId,
        runId: runRow.id,
        mcpServers: canonicalMcpServers, // S05：规范化 MCP 配置（null 则 backend 忽略）
        model, // G22：空则 CLI 默认
        thinkingLevel, // DS4：空则 CLI 默认
        timeoutMs: wallTimeoutMs,
        resumeSessionId: priorSession.resumeSessionId, // DS1
        envVars, // G3-4b：子进程 env 显式覆盖
        customArgs, // G3-4b：CLI argv 注入
        onProcessStarted,
      },
      onEvent,
      signal,
    );
    clearRunAbort(runRow.id);
    // G4-2：先 flush memory/think 围栏；再让独立密钥状态机决定能否放出尾部。
    // 未结束的高置信 credential 会在它的 flush 中整体替换，而不是泄露 held prefix。
    const fenceTail = scrubber.flush();
    publishStreamText('text', messageSecretScrubber.feed(fenceTail));
    publishStreamText('text', messageSecretScrubber.flush());
    publishStreamText('thinking', logSecretScrubber.flush());
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

    // G8-5：ExecutionResult.error 可能来自 CLI stderr / child result。必须在
    // sessionPatch、activity、agent_runs、chat 和 run:failed fan-out 前统一安全化。
    const safeResultError = result.error == null ? null : scrubSecrets(result.error);
    // DS1：session 终态字段
    const sessionPatch = finalizeSessionFields({
      planned: priorSession,
      emittedSessionId: result.providerSessionId,
      exitReason:
        result.exitReason === 'cancelled' || signal.aborted
          ? 'cancelled'
          : result.exitReason,
      errorText: safeResultError,
    });

    if (result.exitReason === 'cancelled' || signal.aborted) {
      // Slice 39：仅 applied 时发 run:cancelled；0-change 不伪成功
      const cancelTr = transitionRun({
        id: runRow.id,
        fromStatuses: ACTIVE_RUN_STATUSES,
        patch: {
          status: 'cancelled',
          finishedAt,
          error: safeResultError,
          waitingLocalEnteredAt: null,
          prepareLeaseExpiresAt: null,
          ...(hasTokens ? tokenPatch : {}),
          ...sessionPatch,
        },
      });
      if (cancelTr.applied && cancelTr.row) {
        eventBus.publish({ type: 'run:cancelled', run: toObservedAgentRun(cancelTr.row) });
      }
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
          payload: { runId: runRow.id, error: safeResultError },
        });
      }
      db.update(agentRuns)
        .set({
          ...(hasTokens ? tokenPatch : {}),
          ...sessionPatch,
        })
        .where(eq(agentRuns.id, runRow.id))
        .run();
      await failRun(runRow.id, safeResultError ?? '执行失败');
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

    // completed —— Slice 39：仅 applied 后才写 comment / memory / 事件
    const completeTr = transitionRun({
      id: runRow.id,
      fromStatuses: ACTIVE_RUN_STATUSES,
      patch: {
        status: 'completed',
        finishedAt,
        error: null,
        waitingLocalEnteredAt: null,
        prepareLeaseExpiresAt: null,
        ...(hasTokens ? tokenPatch : {}),
        ...sessionPatch,
      },
    });
    if (!completeTr.applied || !completeTr.row) {
      return; // 已被 cancel/fail 抢先，禁止伪成功副作用
    }

    // finalText is a transcript side path (comment/chat/memory/subagent parsing),
    // not necessarily represented by a message event. Never fan it out raw.
    const finalText = scrubSecrets(result.finalText || '(无输出)');

    // S12: 解析并委派子代理
    if (finalText && finalText !== '(无输出)') {
      await parseAndDispatchSubagents(runRow.id, finalText).catch((e) => {
        logger.error({ err: e instanceof Error ? e.message : String(e), runId: runRow.id }, 'parseAndDispatchSubagents failed');
      });
    }

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

    // 再读一次确保 status 已落库（QC link 等字段可能变更）
    const rFresh = toObservedAgentRun(
      db.select().from(agentRuns).where(eq(agentRuns.id, runRow.id)).get()!,
    );
    eventBus.publish({ type: 'run:completed', run: rFresh });
    // bu01：run 终态 → inbox（completed | failed；cancelled 不写）
    notifyRunTerminal(rFresh);

    // S09：成功 run 且有 issue 才写记忆（失败/取消路径禁止调用）
    // Slice 25：子 run（parentRunId）跳过 syncRunCompleted，避免 fan-out 污染 memory
    if (linkedIssueId && runRow.parentRunId == null) {
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
              projectId: issueRow.projectId ?? null,
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
        logger.error({ err: e instanceof Error ? e.message : String(e), runId: runRow.id }, '[memory] syncRunCompleted 包装失败');
      }
    }
  } catch (err) {
    clearRunAbort(runRow.id);
    await failRun(runRow.id, scrubSecrets(String(err)));
  } finally {
    if (hb) clearInterval(hb);
    try {
      // 正常 executor settle（含 cancel / failed）后释放活动 ownership。若
      // Node 直接崩溃则 finally 不会运行，侧表会留给启动 reconcile。
      clearExecutionOwnership(runRow.id);
    } catch (err) {
      logger.warn(
        { runId: runRow.id, err: err instanceof Error ? err.message : String(err) },
        'run execution ownership cleanup failed',
      );
    }
    clearToolInflight(runRow.id);
    wakeRunWorker();
  }
}

/** Slice 63：薄包装 → shared classifyFailure 规则表 */
function inferFailureReason(error: string): AgentRunFailureReason {
  return classifyFailure(error);
}

export async function failRun(
  runId: string,
  error: string,
  failureReason?: AgentRun['failureReason'],
): Promise<void> {
  // This is the terminal error choke point for worker throws, child run results
  // and provider stderr-derived failures. Keep run rows/chat/WS/inbox on one
  // safe value even when a caller missed an earlier boundary.
  const safeError = scrubSecrets(error);
  const finishedAt = Date.now();
  const prev = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!prev) return;

  // 显式 failureReason 优先；否则走 Classify 规则表
  const reason = failureReason ?? inferFailureReason(safeError);
  // Slice 39：0-change 不发 run:failed / inbox
  const tr = transitionAndScheduleAutoRetry({
    id: runId,
    fromStatuses: ACTIVE_RUN_STATUSES,
    patch: {
      status: 'failed',
      finishedAt,
      error: safeError,
      failureReason: reason,
      waitingLocalEnteredAt: null,
      prepareLeaseExpiresAt: null,
    },
  });
  if (!tr.applied || !tr.row) return;

  // Infrastructure-only failures may schedule one bounded child. The helper
  // uses a DB conditional INSERT + unique lineage guard, so duplicate fail
  // calls remain harmless. Automation-linked issues are intentionally skipped.
  // P2-4：预算用尽 + runtime_offline + 显式 fallback → 事务内已生成改派子 run
  // （tr.escalatedChild），源 run error 已注明「已自动改派给 X」；重新读行让
  // run:failed 事件/UI 展示最新 error。
  const autoRetryChild = tr.autoRetryChild ?? null;
  const escalatedChild = tr.escalatedChild ?? null;
  const freshRow = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get() ?? tr.row;
  const baseRun = toObservedAgentRun(freshRow);
  const r = autoRetryChild
    ? {
        ...baseRun,
        autoRetryStatus: 'scheduled' as const,
        autoRetryChildId: autoRetryChild.id,
        autoRetryNextAttemptAt: autoRetryChild.nextAttemptAt ?? null,
      }
    : baseRun;
  // chat：失败也写一条 assistant 消息，避免 UI 只剩用户气泡 + 外部 fail card
  const kind = (prev.kind as string) ?? 'issue';
  if (kind === 'chat' && prev.chatThreadId) {
    const mid = crypto.randomUUID();
    const body = `【运行失败】${safeError || '未知错误'}\n\n可在运行详情查看完整信息，或重新发送消息。`;
    db.insert(chatMessages)
      .values({
        id: mid,
        threadId: prev.chatThreadId,
        role: 'assistant',
        body,
        runId,
        createdAt: finishedAt,
      })
      .run();
    db.update(chatThreads)
      .set({ updatedAt: finishedAt })
      .where(eq(chatThreads.id, prev.chatThreadId))
      .run();
  }
  eventBus.publish({ type: 'run:failed', run: r });
  // bu01：失败终态 → inbox
  // While a child is active, the child/Activity events are the actionable
  // surface; suppress the parent's manual retry CTA to avoid double dispatch.
  // P2-4：已自动改派时也不重复推 generic 失败通知（改派 inbox 更可行动）。
  if (!autoRetryChild && !escalatedChild && !hasActiveAutoRetryChild(runId)) {
    notifyRunTerminal(r);
  }
  wakeRunWorker();
}
