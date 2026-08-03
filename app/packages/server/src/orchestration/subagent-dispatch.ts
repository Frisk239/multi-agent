import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents, runMessages, issues } from '../db/schema.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { enqueueAgentRun, enqueueLeaderRun } from './run-service.js';
import { eventBus } from './event-bus.js';
import { wakeRunWorker } from './run-worker.js';
import { computeAgentReadiness } from './readiness.js';
import { toAgentRun, toObservedAgentRun, toRunMessage } from '../db/reshape.js';
import { logger } from '../logger.js';

/** 默认 K=2：depth 0/1 可再派，parent depth≥2 拒绝。env: MA_SUBAGENT_MAX_DEPTH */
export function getSubagentMaxDepth(): number {
  const raw = process.env.MA_SUBAGENT_MAX_DEPTH;
  if (raw == null || raw.trim() === '') return 2;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 2;
  return Math.floor(n);
}

/**
 * 沿 parentRunId 向上算 depth（根=0）。
 * 环 / 异常链：walk 上限 maxDepth+5，避免死循环。
 */
export function computeRunDepth(runId: string): number {
  const maxWalk = getSubagentMaxDepth() + 5;
  let depth = 0;
  let currentId: string | null = runId;
  const seen = new Set<string>();

  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    if (depth >= maxWalk) break;

    const row = db.select().from(agentRuns).where(eq(agentRuns.id, currentId)).get();
    if (!row?.parentRunId) break;

    depth += 1;
    currentId = row.parentRunId;
  }

  return depth;
}

function allowNotReadyEnqueue(): boolean {
  const v = process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  return v === '1' || v === 'true';
}

/** 父 run 轨迹写 system 消息，避免委派失败静默 */
function appendParentSystemMessage(
  parentRun: { id: string; issueId?: string | null },
  body: string,
): void {
  try {
    const maxRow = db
      .select({ m: sql<number>`COALESCE(MAX(${runMessages.seq}), 0)` })
      .from(runMessages)
      .where(eq(runMessages.runId, parentRun.id))
      .get();
    const seq = (maxRow?.m ?? 0) + 1;
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    db.insert(runMessages)
      .values({
        id,
        runId: parentRun.id,
        seq,
        kind: 'system',
        body,
        createdAt,
      })
      .run();
    eventBus.publish({
      type: 'run:message',
      message: toRunMessage({
        id,
        runId: parentRun.id,
        seq,
        kind: 'system',
        body,
        createdAt,
      }),
      issueId: parentRun.issueId ?? null,
    });
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e), parentRunId: parentRun.id },
      'appendParentSystemMessage failed',
    );
  }
}

function reportDispatchFailure(
  parentRun: { id: string; issueId?: string | null },
  targetId: string,
  detail: string,
): void {
  const body = `⚠️ 子代理委派失败（target=${targetId}）：${detail}`;
  logger.error({ parentRunId: parentRun.id, targetId, detail }, body);
  appendParentSystemMessage(parentRun, body);
}

async function assertSubagentReadiness(
  agentId: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (allowNotReadyEnqueue()) return { ok: true };
  const rd = await computeAgentReadiness(agentId);
  if (!rd) {
    return { ok: false, detail: `agent ${agentId} 不存在` };
  }
  if (rd.status === 'cwd_missing') {
    return {
      ok: false,
      detail: rd.detail ?? '工作区未就绪，无法派发（设置 MA_ISSUE_USE_WORKSPACE_CWD 时强制）',
    };
  }
  if (rd.status === 'runtime_missing') {
    return {
      ok: false,
      detail: rd.detail ?? `runtime ${rd.runtime} 未安装或不在 PATH`,
    };
  }
  if (rd.status === 'error') {
    return { ok: false, detail: rd.detail ?? 'agent 就绪探测失败' };
  }
  return { ok: true };
}

export async function parseAndDispatchSubagents(parentRunId: string, text: string) {
  const parentRun = db.select().from(agentRuns).where(eq(agentRuns.id, parentRunId)).get();
  if (!parentRun) return;

  const maxDepth = getSubagentMaxDepth();
  const parentDepth = computeRunDepth(parentRun.id);
  if (parentDepth >= maxDepth) {
    const detail = `委派深度超限：parent depth=${parentDepth} ≥ K=${maxDepth}（MA_SUBAGENT_MAX_DEPTH）`;
    logger.warn({ parentRunId: parentRun.id, parentDepth, maxDepth }, detail);
    appendParentSystemMessage(parentRun, `⚠️ ${detail}`);
    return;
  }

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
    try {
      await dispatchSubagent(parentRun, targetId, prompt);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      reportDispatchFailure(parentRun, targetId, detail);
    }
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
      reportDispatchFailure(parentRun, targetId, 'target 不存在或小队无 leader');
      return;
    }
  }

  // 有 issue：复用 enqueue* 的 readiness / 去重 / 熔断；失败可见写父 run system
  if (parentRun.issueId) {
    const result =
      isLeader && squadId
        ? await enqueueLeaderRun(parentRun.issueId, agentId!, squadId, {
            parentRunId: parentRun.id,
            quickPrompt: prompt,
          })
        : await enqueueAgentRun(parentRun.issueId, agentId!, {
            parentRunId: parentRun.id,
            quickPrompt: prompt,
          });

    if (!result.run) {
      reportDispatchFailure(
        parentRun,
        targetId,
        result.detail ?? result.reason ?? 'enqueue 被跳过',
      );
    }
    return;
  }

  // 无 issue（chat / QC）：先 readiness/cwd 闸，失败不 insert
  const ready = await assertSubagentReadiness(agentId!);
  if (!ready.ok) {
    reportDispatchFailure(parentRun, targetId, ready.detail);
    return;
  }

  const realAgent = db.select().from(agents).where(eq(agents.id, agentId!)).get();
  if (!realAgent) {
    reportDispatchFailure(parentRun, targetId, `agent ${agentId} 不存在`);
    return;
  }

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  // G6-1：子代理 run 继承父 issue 的优先级快照（无 issue 的 QC/chat 默认 none）
  const parentIssueRow = parentRun.issueId
    ? db.select().from(issues).where(eq(issues.id, parentRun.issueId)).get()
    : null;
  db.insert(agentRuns)
    .values({
      id,
      issueId: parentRun.issueId,
      agentId,
      runtime: realAgent.runtime,
      status: 'queued',
      kind: 'quick_create', // Since it has a prompt, treat it as quick_create
      priority: parentIssueRow?.priority ?? 'none',
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
  const run = toObservedAgentRun(row);
  eventBus.publish({ type: 'run:queued', run });
  wakeRunWorker();
}
