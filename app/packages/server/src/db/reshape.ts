import type {
  Issue,
  IssueLabel,
  Assignee,
  Comment,
  AgentRun,
  RunMessage,
  InboxItem,
  AgentDetail,
  AgentSummary,
  AutomationRule,
  AutomationRun,
} from '@ma/shared';
import { inArray } from 'drizzle-orm';
import { db } from './client.js';
import {
  issues,
  comments,
  agentRuns,
  runMessages,
  inboxItems,
  agents,
  automationRules,
  automationRuns,
  issueLabels,
  issueToLabels,
  projects,
} from './schema.js';
import { resolveAssigneeLabel, resolveAuthorLabel } from './client.js';

type IssueRow = typeof issues.$inferSelect;
type LabelRow = typeof issueLabels.$inferSelect;
type CommentRow = typeof comments.$inferSelect;
type RunRow = typeof agentRuns.$inferSelect;
type MsgRow = typeof runMessages.$inferSelect;
type InboxRow = typeof inboxItems.$inferSelect;
type AgentRow = typeof agents.$inferSelect;
type AutomationRuleRow = typeof automationRules.$inferSelect;
type AutomationRunRow = typeof automationRuns.$inferSelect;

export function toIssueLabel(row: LabelRow): IssueLabel {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    color: row.color,
    archivedAt:
      row.archivedAt == null ? null : new Date(row.archivedAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** 批量装载 issue → labels，避免 N+1 */
export function loadLabelsByIssueIds(issueIds: string[]): Map<string, IssueLabel[]> {
  const map = new Map<string, IssueLabel[]>();
  for (const id of issueIds) map.set(id, []);
  if (issueIds.length === 0) return map;

  const junctions = db
    .select()
    .from(issueToLabels)
    .where(inArray(issueToLabels.issueId, issueIds))
    .all();
  if (junctions.length === 0) return map;

  const labelIds = [...new Set(junctions.map((j) => j.labelId))];
  const labelRows = db
    .select()
    .from(issueLabels)
    .where(inArray(issueLabels.id, labelIds))
    .all();
  const byId = new Map(labelRows.map((r) => [r.id, toIssueLabel(r)]));

  for (const j of junctions) {
    const lab = byId.get(j.labelId);
    if (!lab) continue;
    map.get(j.issueId)!.push(lab);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }
  return map;
}

/** 批量装载子 issue 进度（done|cancelled 计完成） */
export function loadChildProgressByParentIds(
  parentIds: string[],
): Map<string, { total: number; done: number }> {
  const map = new Map<string, { total: number; done: number }>();
  for (const id of parentIds) map.set(id, { total: 0, done: 0 });
  if (parentIds.length === 0) return map;

  const children = db
    .select({
      parentIssueId: issues.parentIssueId,
      status: issues.status,
    })
    .from(issues)
    .where(inArray(issues.parentIssueId, parentIds))
    .all();

  for (const c of children) {
    if (!c.parentIssueId) continue;
    const slot = map.get(c.parentIssueId);
    if (!slot) continue;
    slot.total += 1;
    if (c.status === 'done' || c.status === 'cancelled') slot.done += 1;
  }
  return map;
}

/** 批量装载父 identifier */
export function loadParentIdentifiers(
  parentIds: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  const unique = [...new Set(parentIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const rows = db
    .select({ id: issues.id, identifier: issues.identifier })
    .from(issues)
    .where(inArray(issues.id, unique))
    .all();
  for (const r of rows) map.set(r.id, r.identifier);
  return map;
}

/** 批量装载项目 title */
export function loadProjectTitles(projectIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const unique = [...new Set(projectIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const rows = db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(inArray(projects.id, unique))
    .all();
  for (const r of rows) map.set(r.id, r.title);
  return map;
}

// DB 扁平行 → API 嵌套 Issue（spec §3.3 + §4.2 R2 label）
export function toIssue(
  row: IssueRow,
  labels: IssueLabel[] = [],
  extras?: {
    parentIdentifier?: string | null;
    childProgress?: { total: number; done: number } | null;
    projectTitle?: string | null;
  },
): Issue {
  let assignee: Assignee = null;
  if (row.assigneeType && row.assigneeId) {
    const label = resolveAssigneeLabel(row.assigneeType, row.assigneeId);
    assignee = { type: row.assigneeType, id: row.assigneeId, label: label ?? '未知' };
  }
  const originType =
    row.originType === 'quick_create' || row.originType === 'automation'
      ? row.originType
      : null;
  const parentIssueId = row.parentIssueId ?? null;
  const projectId = row.projectId ?? null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee,
    creatorType: row.creatorType,
    creatorId: row.creatorId,
    position: row.position,
    originType,
    originRunId: row.originRunId ?? null,
    originRuleId: row.originRuleId ?? null,
    parentIssueId,
    parentIdentifier: parentIssueId
      ? (extras?.parentIdentifier ?? null)
      : null,
    childProgress:
      extras?.childProgress && extras.childProgress.total > 0
        ? extras.childProgress
        : null,
    projectId,
    projectTitle: projectId ? (extras?.projectTitle ?? null) : null,
    prUrl: row.prUrl ?? null,
    labels,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    issueId: row.issueId,
    type: row.type,
    authorType: row.authorType,
    authorId: row.authorId,
    authorLabel: resolveAuthorLabel(row.authorType, row.authorId),
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// ms → ISO 字符串；null 保持 null（对齐 AgentRun.startedAt/finishedAt 的 datetime().nullable()）
function iso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

// DB 扁平行 → API AgentRun（S03 执行层）
// S04：映射 isLeader（integer 0/1 → boolean）+ squadId
// bu01：lastHeartbeatAt
// bu03：nullable issueId + kind + quickPrompt
export function toAgentRun(row: RunRow): AgentRun {
  return {
    id: row.id,
    issueId: row.issueId ?? null,
    agentId: row.agentId,
    runtime: row.runtime,
    status: row.status,
    kind: (row.kind as 'issue' | 'quick_create' | 'chat') ?? 'issue',
    quickPrompt: row.quickPrompt ?? null,
    chatThreadId: (row as { chatThreadId?: string | null }).chatThreadId ?? null,
    error: row.error,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    lastHeartbeatAt: iso(row.lastHeartbeatAt),
    isLeader: row.isLeader === 1,
    squadId: row.squadId,
    rerunOfRunId: row.rerunOfRunId ?? null,
    cwdPath: (row as { cwdPath?: string | null }).cwdPath ?? null,
    cwdMode:
      ((row as { cwdMode?: AgentRun['cwdMode'] }).cwdMode as AgentRun['cwdMode']) ??
      null,
    projectId: (row as { projectId?: string | null }).projectId ?? null,
    // C1 path 锁字段由 routes 用 enrichRunRowWithPathLock 填充；默认空
    pathWaitReason: null,
    pathBlockedByRunId: null,
    pathHolding: false,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function truncSummary(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

// bu01：DB inbox_item → API InboxItem（impl-2 writer/routes 用）
export function toInboxItem(
  row: InboxRow,
  issueMeta?: { identifier: string; title: string },
): InboxItem {
  const body = row.body ?? null;
  const summary = body
    ? `${row.title}: ${truncSummary(body, 100)}`
    : row.title;
  return {
    id: row.id,
    type: row.type,
    kind: row.type,
    severity: row.severity,
    title: row.title,
    body,
    summary,
    issueId: row.issueId,
    runId: row.runId ?? null,
    issueIdentifier: issueMeta?.identifier,
    issueTitle: issueMeta?.title,
    read: row.read === 1,
    archived: row.archived === 1,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// DB 扁平行 → API RunMessage（S03 执行轨迹）
export function toRunMessage(row: MsgRow): RunMessage {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    kind: row.kind,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// bu02：DB agent → API AgentSummary / AgentDetail
export function toAgentSummary(row: AgentRow): AgentSummary {
  return {
    id: row.id,
    name: row.name,
    runtime: row.runtime,
    category: row.category ?? null,
    model: row.model?.trim() ? row.model.trim() : null,
    archivedAt:
      row.archivedAt == null ? null : new Date(row.archivedAt).toISOString(),
  };
}

export function toAgentDetail(row: AgentRow): AgentDetail {
  return {
    id: row.id,
    name: row.name,
    runtime: row.runtime,
    category: row.category ?? null,
    model: row.model?.trim() ? row.model.trim() : null,
    concurrency: row.concurrency,
    mcpServers: row.mcpServers ?? null,
    instructions: row.instructions ?? '',
    archivedAt:
      row.archivedAt == null ? null : new Date(row.archivedAt).toISOString(),
  };
}

/** 与 automation-dispatch.computeNextPlannedAt 同语义（避免 reshape↔dispatch 循环依赖） */
function nextPlannedAtMs(row: AutomationRuleRow, now: number): number | null {
  if (row.enabled !== 1) return null;
  if (row.scheduleKind === 'interval_minutes') {
    const n = row.intervalMinutes;
    if (n == null || n <= 0) return null;
    const grid = n * 60_000;
    return Math.floor(now / grid) * grid + grid;
  }
  if (row.scheduleKind === 'daily_at') {
    const daily = row.dailyTime;
    if (!daily || !/^\d{2}:\d{2}$/.test(daily)) return null;
    const [hh, mm] = daily.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    const today = d.getTime();
    if (now < today) return today;
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return null;
}

// bu05：DB automation_rule → API AutomationRule
// automation-next-run：附带 nextPlannedAt；automation-fail-counts 由路由层填 fail 聚合
export function toAutomationRule(
  row: AutomationRuleRow,
  stats?: { failCount?: number; lastRunStatus?: AutomationRule['lastRunStatus'] },
): AutomationRule {
  const nextMs = nextPlannedAtMs(row, Date.now());
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    scheduleKind: row.scheduleKind,
    intervalMinutes: row.intervalMinutes ?? null,
    dailyTime: row.dailyTime ?? null,
    assigneeType: row.assigneeType,
    assigneeId: row.assigneeId,
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate ?? '',
    lastPlannedAt: row.lastPlannedAt == null ? null : new Date(row.lastPlannedAt).toISOString(),
    nextPlannedAt: nextMs == null ? null : new Date(nextMs).toISOString(),
    failCount: stats?.failCount ?? 0,
    lastRunStatus: stats?.lastRunStatus ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

// bu05：DB automation_run → API AutomationRun
export function toAutomationRun(row: AutomationRunRow): AutomationRun {
  return {
    id: row.id,
    ruleId: row.ruleId,
    plannedAt: new Date(row.plannedAt).toISOString(),
    source: row.source,
    status: row.status,
    issueId: row.issueId ?? null,
    error: row.error ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
