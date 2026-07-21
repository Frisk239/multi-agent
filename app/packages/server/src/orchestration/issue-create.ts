import { eq, sql, and } from 'drizzle-orm';
import type { Issue, IssueEnqueueMeta, Priority } from '@ma/shared';
import { db } from '../db/client.js';
import { issues, agentRuns, projects } from '../db/schema.js';
import { toIssue } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import {
  enqueueAgentRun,
  enqueueLeaderRun,
  toIssueEnqueueMeta,
  type EnqueueResult,
} from './run-service.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { LOCAL_MEMBER } from '../local-member.js';
import { ensureIssueSubscriber, notifyAssigned } from './inbox-writer.js';

const WS_ID = 'ws-local';

export type CreateIssueCoreInput = {
  title: string;
  description?: string | null;
  priority?: Priority;
  assignee?: { type: 'member' | 'agent' | 'squad'; id: string } | null;
  originType?: 'quick_create' | 'automation' | null;
  originRunId?: string | null;
  originRuleId?: string | null;
  /** issue-subtasks：父 issue id（仅一层） */
  parentIssueId?: string | null;
  /** projects-mvp：可选项目 */
  projectId?: string | null;
  /** 默认 true：有 assignee 则 enqueue */
  enqueue?: boolean;
};

export type CreateIssueCoreResult =
  | { ok: true; issue: Issue; enqueue: IssueEnqueueMeta }
  | { ok: false; status: 400 | 404 | 409; error: string; issueId?: string };

/**
 * 内部建 Issue 核心路径（bu05）：供 POST /api/issues 与 automation dispatch 共用。
 * 含 identifier/position、eventBus、inbox 订阅、可选 enqueue。
 */
export async function createIssueCore(
  input: CreateIssueCoreInput,
): Promise<CreateIssueCoreResult> {
  const now = Date.now();
  const originType =
    input.originType === 'quick_create' || input.originType === 'automation'
      ? input.originType
      : null;
  const originRunId = input.originRunId ?? null;
  const originRuleId = input.originRuleId ?? null;
  const shouldEnqueue = input.enqueue !== false;
  let parentIssueId: string | null = input.parentIssueId?.trim() || null;
  let parentIdentifier: string | null = null;
  let projectId: string | null = input.projectId?.trim() || null;
  let projectTitle: string | null = null;

  // bu03：先校验 origin run，再建卡（失败不留半成品 issue）
  if (originType === 'quick_create' && originRunId) {
    const run = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, originRunId))
      .get();
    if (!run || run.kind !== 'quick_create') {
      return { ok: false, status: 400, error: 'origin run 无效或非 quick_create' };
    }
    if (run.issueId) {
      return {
        ok: false,
        status: 409,
        error: 'origin run 已关联 issue',
        issueId: run.issueId,
      };
    }
    // B2：QC 绑了 project 时，建卡继承（agent 未显式传 projectId 也进真仓）
    if (!projectId && run.projectId) {
      projectId = run.projectId;
    }
  }

  // issue-subtasks：校验父存在、同 workspace、禁止孙级
  if (parentIssueId) {
    const parent = db
      .select()
      .from(issues)
      .where(and(eq(issues.id, parentIssueId), eq(issues.workspaceId, WS_ID)))
      .get();
    if (!parent) {
      return { ok: false, status: 404, error: '父 issue 不存在' };
    }
    if (parent.parentIssueId) {
      return {
        ok: false,
        status: 400,
        error: '不支持多层子 issue：父级本身已是子 issue',
      };
    }
    parentIdentifier = parent.identifier;
  }

  if (projectId) {
    const proj = db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, WS_ID)))
      .get();
    if (!proj) {
      return { ok: false, status: 404, error: 'project 不存在' };
    }
    projectTitle = proj.title;
  }

  // identifier 生成：MAX(SUBSTR(identifier,5))+1
  // 注意 SUBSTR 是 1-based：FRI-11 的数字从第 5 字符开始（F=1,R=2,I=3,-=4,1=5）
  const maxRow = db
    .select({ maxNum: sql<number>`MAX(CAST(SUBSTR(${issues.identifier}, 5) AS INTEGER))` })
    .from(issues)
    .where(eq(issues.workspaceId, WS_ID))
    .get();
  const nextNum = (maxRow?.maxNum ?? 0) + 1;
  const identifier = `FRI-${nextNum}`;

  // position 浮顶：MIN(position)-1
  const minRow = db
    .select({ minPos: sql<number>`COALESCE(MIN(${issues.position}), 0) - 1` })
    .from(issues)
    .where(and(eq(issues.workspaceId, WS_ID), eq(issues.status, 'backlog')))
    .get();
  const position = minRow?.minPos ?? -1;

  const id = crypto.randomUUID();
  const priority = input.priority ?? 'none';

  db.insert(issues)
    .values({
      id,
      workspaceId: WS_ID,
      identifier,
      title: input.title,
      description: input.description ?? null,
      status: 'backlog',
      priority,
      assigneeType: input.assignee?.type ?? null,
      assigneeId: input.assignee?.id ?? null,
      creatorType: 'member',
      creatorId: LOCAL_MEMBER.id,
      position,
      originType,
      originRunId,
      originRuleId,
      parentIssueId,
      projectId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // bu03：Link QC run.issueId（在 enqueue 工作 run 之前）
  if (originType === 'quick_create' && originRunId) {
    db.update(agentRuns)
      .set({ issueId: id })
      .where(
        and(
          eq(agentRuns.id, originRunId),
          eq(agentRuns.kind, 'quick_create'),
        ),
      )
      .run();
  }

  const row = db.select().from(issues).where(eq(issues.id, id)).get();
  const issue = toIssue(row!, [], {
    parentIdentifier,
    childProgress: null,
    projectTitle,
  });
  eventBus.publish({ type: 'issue:created', issue });

  ensureIssueSubscriber(id, 'member', LOCAL_MEMBER.id, 'creator');
  if (input.assignee) {
    notifyAssigned(issue);
  }

  let enqResult: EnqueueResult | null = null;
  if (shouldEnqueue) {
    if (input.assignee?.type === 'agent' && input.assignee.id) {
      try {
        enqResult = await enqueueAgentRun(id, input.assignee.id);
      } catch (e) {
        console.error('[issue-create] enqueueAgentRun failed', e);
        enqResult = {
          run: null,
          skipped: true,
          reason: 'readiness_error',
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    } else if (input.assignee?.type === 'squad' && input.assignee.id) {
      try {
        const squad = loadSquadDetail(input.assignee.id);
        if (squad?.leaderId) {
          enqResult = await enqueueLeaderRun(id, squad.leaderId, squad.id);
        } else {
          // B3：无 leader 不静默——显式 skipped，前端 toast / automation 可解释
          enqResult = {
            run: null,
            skipped: true,
            reason: 'no_leader',
            detail: `小队「${squad?.name ?? input.assignee.id}」无 leader，无法开工`,
          };
        }
      } catch (e) {
        console.error('[issue-create] enqueueLeaderRun failed', e);
        enqResult = {
          run: null,
          skipped: true,
          reason: 'readiness_error',
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  return {
    ok: true,
    issue,
    enqueue: toIssueEnqueueMeta(
      shouldEnqueue && input.assignee?.type !== 'member' ? enqResult : null,
    ),
  };
}
