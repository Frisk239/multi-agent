/**
 * DS1：CLI provider session resume 决策（ADR 0004）。
 * 仅 claude-code 走真 --resume；其它 runtime 诚实 unsupported。
 */
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, chatThreads } from '../db/schema.js';

export type SessionResumeStatus =
  | 'fresh'
  | 'resumed'
  | 'poison_fresh'
  | 'unsupported'
  | 'resume_miss';

export type PriorSessionDecision = {
  /** 传给 CLI 的 --resume id；null = fresh */
  resumeSessionId: string | null;
  /** 落库初始/计划状态（execute 后可能改 resume_miss / resumed） */
  status: SessionResumeStatus;
  /** 决策说明（日志/调试） */
  reason: string;
  sourceRunId: string | null;
};

const RESUMABLE_RUNTIME = 'claude-code' as const;

/** 最小 poison 启发式（ADR 0004） */
const POISON_PATTERNS: RegExp[] = [
  /prompt is too long/i,
  /context[_\s-]?length/i,
  /context overflow/i,
  /context window/i,
  /invalid_request_error/i,
  /no conversation found/i,
  /resume-unsafe/i,
];

export function isSessionPoisonText(...parts: Array<string | null | undefined>): boolean {
  const blob = parts.filter(Boolean).join('\n');
  if (!blob.trim()) return false;
  return POISON_PATTERNS.some((re) => re.test(blob));
}

function rowSessionId(row: {
  providerSessionId?: string | null;
  sessionPoisoned?: number | null;
  runtime?: string;
}): string | null {
  if (row.sessionPoisoned === 1) return null;
  const id = row.providerSessionId?.trim();
  return id || null;
}

/**
 * 从 DB 选 prior session。
 * 优先 rerunOfRunId 精确源 run；否则同 issue/chat + agent + runtime 最近可 resume。
 */
export function resolvePriorSession(runRow: {
  id: string;
  runtime: string;
  agentId: string;
  issueId?: string | null;
  chatThreadId?: string | null;
  kind?: string | null;
  rerunOfRunId?: string | null;
}): PriorSessionDecision {
  if (runRow.runtime !== RESUMABLE_RUNTIME) {
    return {
      resumeSessionId: null,
      status: 'unsupported',
      reason: `runtime ${runRow.runtime} 不支持真 session resume`,
      sourceRunId: null,
    };
  }

  const trySource = (srcId: string | null | undefined): PriorSessionDecision | null => {
    if (!srcId?.trim()) return null;
    const src = db.select().from(agentRuns).where(eq(agentRuns.id, srcId)).get();
    if (!src) return null;
    if (src.runtime !== runRow.runtime) {
      return {
        resumeSessionId: null,
        status: 'fresh',
        reason: '源 run runtime 不一致，fresh',
        sourceRunId: src.id,
      };
    }
    if (src.sessionPoisoned === 1) {
      return {
        resumeSessionId: null,
        status: 'poison_fresh',
        reason: '源 run session 已中毒，强制 fresh',
        sourceRunId: src.id,
      };
    }
    const sid = rowSessionId(src);
    if (!sid) {
      return {
        resumeSessionId: null,
        status: 'fresh',
        reason: '源 run 无 provider_session_id',
        sourceRunId: src.id,
      };
    }
    return {
      resumeSessionId: sid,
      status: 'resumed',
      reason: `resume 自源 run ${src.id}`,
      sourceRunId: src.id,
    };
  };

  const fromRerun = trySource(runRow.rerunOfRunId);
  if (fromRerun) return fromRerun;

  // 最近可 resume：同 agent+runtime，带 provider_session_id，未毒，非本 run
  const kind = (runRow.kind as string) ?? 'issue';
  let candidates: (typeof agentRuns.$inferSelect)[] = [];
  if (kind === 'chat' && runRow.chatThreadId) {
    candidates = db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.chatThreadId, runRow.chatThreadId),
          eq(agentRuns.agentId, runRow.agentId),
          eq(agentRuns.runtime, runRow.runtime),
          ne(agentRuns.id, runRow.id),
          isNotNull(agentRuns.providerSessionId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(20)
      .all();
  } else if (runRow.issueId) {
    candidates = db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.issueId, runRow.issueId),
          eq(agentRuns.agentId, runRow.agentId),
          eq(agentRuns.runtime, runRow.runtime),
          ne(agentRuns.id, runRow.id),
          isNotNull(agentRuns.providerSessionId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(20)
      .all();
  }

  for (const c of candidates) {
    if (c.sessionPoisoned === 1) continue;
    const sid = rowSessionId(c);
    if (!sid) continue;
    return {
      resumeSessionId: sid,
      status: 'resumed',
      reason: `resume 自最近 run ${c.id}`,
      sourceRunId: c.id,
    };
  }

  // 最近一条存在但全毒？
  const poisonedHit = candidates.find((c) => c.sessionPoisoned === 1 && c.providerSessionId);
  if (poisonedHit) {
    return {
      resumeSessionId: null,
      status: 'poison_fresh',
      reason: '最近 session 均已中毒，强制 fresh',
      sourceRunId: poisonedHit.id,
    };
  }

  // 若无 candidates，尝试从 chatThreads.lastSessionId 回退
  if (kind === 'chat' && runRow.chatThreadId) {
    const thread = db.select().from(chatThreads).where(eq(chatThreads.id, runRow.chatThreadId)).get();
    const threadLastSessionId = thread?.lastSessionId?.trim();
    if (threadLastSessionId) {
      return {
        resumeSessionId: threadLastSessionId,
        status: 'resumed',
        reason: `resume 自 chatThread.lastSessionId ${threadLastSessionId}`,
        sourceRunId: null,
      };
    }
  }

  return {
    resumeSessionId: null,
    status: 'fresh',
    reason: '无可 resume 的 prior session',
    sourceRunId: null,
  };
}

/**
 * 终态：根据 CLI 报告与错误，修正 status / 是否写回 session / 是否标毒。
 */
export function finalizeSessionFields(opts: {
  planned: PriorSessionDecision;
  emittedSessionId: string | null | undefined;
  exitReason: 'completed' | 'cancelled' | 'failed';
  errorText?: string | null;
}): {
  providerSessionId: string | null;
  resumedSessionId: string | null;
  sessionResumeStatus: SessionResumeStatus;
  sessionPoisoned: number;
} {
  const requested = opts.planned.resumeSessionId?.trim() || null;
  let emitted = opts.emittedSessionId?.trim() || null;
  const err = opts.errorText ?? '';
  const failed = opts.exitReason === 'failed';
  const poison = isSessionPoisonText(err, emitted);

  // Multica resolveSessionID：resume 失败且 id 变了 / no conversation → 不落死 id
  if (failed && requested) {
    if (isSessionPoisonText(err) || /no conversation found/i.test(err)) {
      emitted = null;
    } else if (emitted && emitted !== requested) {
      emitted = null;
    }
  }

  let status: SessionResumeStatus;
  if (opts.planned.status === 'unsupported') {
    status = 'unsupported';
  } else if (opts.planned.status === 'poison_fresh' && !requested) {
    status = 'poison_fresh';
  } else if (requested && failed && !emitted) {
    status = 'resume_miss';
  } else if (requested && emitted) {
    status = 'resumed';
  } else if (!requested) {
    status = 'fresh';
  } else {
    status = opts.planned.status;
  }

  // 可被后续 resume 的 id；失败且无 emitted 则清空
  let providerSessionId: string | null = emitted;
  if (failed && !emitted) providerSessionId = null;

  return {
    providerSessionId,
    resumedSessionId: requested,
    sessionResumeStatus: status,
    sessionPoisoned: poison ? 1 : 0,
  };
}
