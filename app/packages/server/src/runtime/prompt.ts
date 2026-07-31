import { eq, desc, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  issues,
  comments,
  agentSkills,
  agents,
  agentRuns,
  users,
  chatMessages,
} from '../db/schema.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { getSkillIndex, loadSkillsFromRoot, type SkillInfo } from '../skill/scanner.js';
import { readManagedBlock } from '../wiki/agents-bridge.js';
import { memoryManager } from '../memory/manager.js';
import { buildQuickCreatePrompt } from './quick-create-prompt.js';
import { LOCAL_MEMBER } from '../local-member.js';
import { projectThreadsForPrompt } from '../comment-thread.js';
import {
  readAgentsContextFromRoot,
  resolveIssuePromptContext,
} from './issue-prompt-context.js';

// prompt 最近评论条数（spec §6.2 R2，K=20，可配置）
const K = 20;

/** Chat 多轮历史条数（默认 20；MA_CHAT_HISTORY_LIMIT 可覆盖；0=不注入历史） */
const CHAT_HISTORY_DEFAULT = 20;

export function chatHistoryLimit(): number {
  const raw = process.env.MA_CHAT_HISTORY_LIMIT;
  if (raw === undefined || raw === '') return CHAT_HISTORY_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return CHAT_HISTORY_DEFAULT;
  return Math.floor(n);
}

export type ChatHistoryMessage = { role: string; body: string };

/**
 * 将 prior 消息格式化为 prompt 块（纯函数，可单测）。
 * Multica 对照：daemon.go trailingUserMessages 只发未答用户消息（因 session 复用）；
 * 本仓每次新起 CLI，故注入完整 recent 对话（不含当前 user 行）。
 */
export function formatChatHistoryBlock(messages: ChatHistoryMessage[]): string | null {
  if (!messages.length) return null;
  const lines = messages.map((m) => {
    const role =
      m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
    const body = (m.body ?? '').trim();
    return `[${role}]\n${body}`;
  });
  return `## 会话历史（多轮上下文）\n${lines.join('\n\n')}`;
}

/**
 * 加载本 run 的 prior 历史：同 thread 内、当前 user 消息之前的最近 N 条。
 * 当前 user 消息用 runId 关联（POST message 时已绑定）。
 */
export function loadPriorChatMessages(
  threadId: string,
  runId: string,
  limit = chatHistoryLimit(),
): ChatHistoryMessage[] {
  if (!threadId || limit <= 0) return [];
  const rows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt))
    .all();
  if (!rows.length) return [];

  // 当前 user 消息 = 绑定本 runId 的 user 行；找不到则退化为最后一条 user
  let currentIdx = rows.findIndex((r) => r.runId === runId && r.role === 'user');
  if (currentIdx < 0) {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]!.role === 'user') {
        currentIdx = i;
        break;
      }
    }
  }
  const prior =
    currentIdx >= 0 ? rows.slice(0, currentIdx) : rows.slice(0, Math.max(0, rows.length - 1));
  const slice = prior.slice(-limit);
  return slice.map((r) => ({ role: r.role, body: r.body }));
}

/**
 * 查找 chatThreadId 下最近一次 role === 'assistant' 消息之后发生的所有 role === 'user' 消息。
 * 若无 assistant 消息，则取全部 user 消息。
 */
export function getTrailingUserMessages(
  threadId: string,
): (typeof chatMessages.$inferSelect)[] {
  if (!threadId) return [];
  const rows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt))
    .all();
  if (!rows.length) return [];

  let lastAssistantIdx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]!.role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }

  const trailing = lastAssistantIdx >= 0 ? rows.slice(lastAssistantIdx + 1) : rows;
  return trailing.filter((r) => r.role === 'user');
}

/**
 * 将 trailing user 消息按时间顺序合并为文本。
 */
export function formatTrailingUserText(threadId: string): string {
  const msgs = getTrailingUserMessages(threadId);
  return msgs
    .map((m) => m.body.trim())
    .filter(Boolean)
    .join('\n\n');
}

// buildPrompt —— 组装喂给 CLI 的 user prompt（spec §6.2）：
// Issue 标题 + 描述 + 最近 K 条 comment 文本 + 一句工作指令。
// Slice 43 / hermes cache（G-PROMPT-CACHE + slice7 围栏）：
//   staticSystem 前缀固定（可缓存）：skills / about / instructions / boundary / squad protocol+roster
//   dynamicUser  per-run：mission / issue body+comments / wiki retrieved / memory retrieved
// 固定组装顺序：staticSystem → dynamicUser，节间用 PROMPT_PART_SEPARATOR。
// CLI 仍只收拼接后的单字符串（composePrompt）；密钥模型不改、不落库。

/** 节间分隔（slice7 / G-SKILL-INJECT 既有围栏，勿改） */
export const PROMPT_PART_SEPARATOR = '\n\n---\n\n';

/**
 * Slice 43：静态 system 前缀 vs per-run 动态 user 侧。
 * 换 memory / issue 评论不应改写 staticSystem，便于 provider prompt cache。
 */
export type PromptParts = {
  /** 可缓存前缀：skills · about · instructions · boundary · squad protocol/roster */
  staticSystem: string;
  /** per-run：mission · issue body/comments · wiki/memory retrieved-context */
  dynamicUser: string;
};

export interface PromptRunContext {
  isLeader: boolean;
  squadId: string | null;
  agentId?: string; // S05：查 agent_skill 分配；bu02：查 instructions
  /** Slice 25：子代理 run 跳过 memory prefetch 注入 */
  skipMemory?: boolean;
}

/** 过滤空节后按固定分隔符拼接 */
export function joinPromptSections(sections: Array<string | null | undefined>): string {
  return sections
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(PROMPT_PART_SEPARATOR);
}

/** 固定顺序：staticSystem 前缀 + dynamicUser */
export function composePrompt(parts: PromptParts): string {
  return joinPromptSections([parts.staticSystem, parts.dynamicUser]);
}

function wrapRetrievedContext(
  kind: 'wiki' | 'memory',
  title: string,
  body: string,
): string {
  return `<retrieved-context kind="${kind}" title="${title}">\n${body}\n</retrieved-context>`;
}

/**
 * 纯组装：静态 / 动态边界唯一入口（单测换 memory 不改 static 前缀）。
 * 顺序见 Slice 43 Must。
 */
export function assembleIssuePromptParts(blocks: {
  skillBlock?: string | null;
  aboutBlock?: string | null;
  instructionsBlock?: string | null;
  boundaryBlock?: string | null;
  /** Squad Operating Protocol + Roster（静态） */
  squadProtocolBlock?: string | null;
  /** Mission Directive：per-run / per-squad 任务，进动态 */
  missionBlock?: string | null;
  issueBody: string;
  wikiBlock?: string | null;
  repoContextNote?: string | null;
  /** 已是 memory 正文；此处包 retrieved-context */
  memoryBlock?: string | null;
}): PromptParts {
  const staticSystem = joinPromptSections([
    blocks.skillBlock,
    blocks.aboutBlock,
    blocks.instructionsBlock,
    blocks.boundaryBlock,
    blocks.squadProtocolBlock,
  ]);

  const memoryWrapped = blocks.memoryBlock?.trim()
    ? wrapRetrievedContext('memory', 'Memory Context', blocks.memoryBlock.trim())
    : null;

  const dynamicUser = joinPromptSections([
    blocks.missionBlock,
    blocks.issueBody,
    blocks.wikiBlock,
    blocks.repoContextNote,
    memoryWrapped,
  ]);

  return { staticSystem, dynamicUser };
}

/** 静态前缀各节（skills → about → instructions → boundary → protocol/roster） */
export function buildStaticSystemParts(blocks: {
  skillBlock?: string | null;
  aboutBlock?: string | null;
  instructionsBlock?: string | null;
  boundaryBlock?: string | null;
  squadProtocolBlock?: string | null;
}): string[] {
  return [
    blocks.skillBlock,
    blocks.aboutBlock,
    blocks.instructionsBlock,
    blocks.boundaryBlock,
    blocks.squadProtocolBlock,
  ]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
}

/** 动态 user 各节（mission → issue → wiki/note → memory） */
export function buildDynamicUserParts(blocks: {
  missionBlock?: string | null;
  issueBody: string;
  wikiBlock?: string | null;
  repoContextNote?: string | null;
  memoryBlock?: string | null;
}): string[] {
  const memoryWrapped = blocks.memoryBlock?.trim()
    ? wrapRetrievedContext('memory', 'Memory Context', blocks.memoryBlock.trim())
    : null;
  return [
    blocks.missionBlock,
    blocks.issueBody,
    blocks.wikiBlock,
    blocks.repoContextNote,
    memoryWrapped,
  ]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
}

function serverUrlFromEnv(): string {
  const fromEnv = process.env.MA_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const port = process.env.PORT ?? '3001';
  return `http://127.0.0.1:${port}`;
}

// bu03：按 run.kind 选择 prompt；QC 不走 issue buildPrompt
// DS1 opts.skipChatHistoryForResume：真 CLI resume 时不塞假历史（ADR 0004）
export async function resolveRunPrompt(
  runRow: typeof agentRuns.$inferSelect,
  opts?: { skipChatHistoryForResume?: boolean; priorSessionId?: string | null },
): Promise<string | null> {
  const kind = (runRow.kind as 'issue' | 'quick_create' | 'chat') ?? 'issue';
  if (kind === 'chat') {
    const threadId = runRow.chatThreadId?.trim() ?? '';
    const trailingText = threadId ? formatTrailingUserText(threadId) : '';
    const userText = trailingText || runRow.quickPrompt?.trim();
    if (!userText) return null;
    const agent = db.select().from(agents).where(eq(agents.id, runRow.agentId)).get();
    const name = agent?.name ?? runRow.agentId;
    const instructions = agent?.instructions?.trim();
    // 与 resolve-run-cwd 对齐：chat 默认隔离 scratch，勿把 cwd 当用户项目
    const useWs =
      process.env.MA_CHAT_USE_WORKSPACE_CWD === '1' ||
      process.env.MA_CHAT_USE_WORKSPACE_CWD === 'true';
    const cwdNote = useWs
      ? '当前进程 cwd 是用户配置的工作区根目录。仍请先确认用户意图再读写文件。'
      : [
          '当前进程 cwd 是本会话的隔离空目录（非用户项目、非 multi-agent 源码仓）。',
          '不要主动探索/搜索上级目录或其它仓库；用户未给出路径时，用对话回答即可。',
          '只有用户明确给出本机路径并要求读写时，才访问该路径。',
        ].join('\n');
    
    const allowedPaths = agent?.allowedPaths?.trim();
    const boundaryFence = allowedPaths
      ? `<boundary-fence>\n限制修改路径白名单: ${allowedPaths}\n警告: 禁止修改、删除或新建白名单路径之外的任何文件。\n</boundary-fence>`
      : null;

    // 多轮：默认注入同 thread 历史（假 resume）。
    // DS1：真 CLI resume 时跳过历史块，避免双倍上下文（ADR 0004）。
    const skipHistory = opts?.skipChatHistoryForResume === true;
    const prior =
      !skipHistory && threadId
        ? loadPriorChatMessages(threadId, runRow.id, chatHistoryLimit())
        : [];
    const historyBlock = formatChatHistoryBlock(prior);
    const resumeNote = skipHistory
      ? '本轮已连接同一 Claude CLI 会话（真 resume）；勿重复复述全部历史，直接回应当前消息。'
      : null;
    const parts = [
      `你是智能体「${name}」，正在与用户进行一对一聊天（非 Issue 任务）。`,
      instructions ? `你的指令：\n${instructions}` : null,
      boundaryFence,
      cwdNote,
      '请直接、简洁地回答用户。不要擅自改仓库代码，除非用户明确要求。',
      skipHistory
        ? null
        : '若上方有会话历史，请结合历史连贯作答；当前用户消息以最后一节为准。',
      resumeNote,
      historyBlock,
      `## 当前用户消息\n${userText}`,
    ];
    return parts.filter(Boolean).join('\n\n');
  }
  if (kind === 'quick_create') {
    const prompt = runRow.quickPrompt?.trim();
    if (!prompt) return null;
    const assigneeType: 'agent' | 'squad' =
      runRow.isLeader === 1 && runRow.squadId ? 'squad' : 'agent';
    const assigneeId =
      assigneeType === 'squad' && runRow.squadId ? runRow.squadId : runRow.agentId;
    return buildQuickCreatePrompt({
      prompt,
      runId: runRow.id,
      agentId: runRow.agentId,
      assigneeType,
      assigneeId,
      isLeader: runRow.isLeader === 1,
      squadId: runRow.squadId,
      serverUrl: serverUrlFromEnv(),
    });
  }
  if (!runRow.issueId) return null;
  // Slice 25：子 run（有 parentRunId）默认 skipMemory，避免 fan-out 污染 prompt
  return buildPrompt(runRow.issueId, {
    isLeader: runRow.isLeader === 1,
    squadId: runRow.squadId,
    agentId: runRow.agentId,
    skipMemory: runRow.parentRunId != null,
  });
}

/**
 * F6：解析 agent 已分配 skill；project_local 时优先该仓 `.skills` 正文；
 * isolated 时跳过「工作区 project」来源 skill，避免错仓方法论。
 */
export function resolveAssignedSkillsForContext(
  agentId: string,
  ctx: { injectRepoContext: boolean; mode: string; path: string | null },
): SkillInfo[] {
  const assigned = db
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.agentId, agentId))
    .all();
  if (!assigned.length) return [];

  const global = getSkillIndex();
  const fromRepo =
    ctx.injectRepoContext && ctx.mode === 'project_local' && ctx.path
      ? loadSkillsFromRoot(ctx.path)
      : null;

  const out: SkillInfo[] = [];
  for (const a of assigned) {
    const fromProject = fromRepo?.get(a.skillId);
    if (fromProject) {
      out.push(fromProject);
      continue;
    }
    const g = global.get(a.skillId);
    if (!g) continue;
    // 隔离 workdir：不要塞控制台仓 / 全局 workspace 的 project skill
    if (
      (ctx.mode === 'isolated_issue' || ctx.mode === 'isolated_run' || ctx.mode === 'none') &&
      g.source === 'project'
    ) {
      continue;
    }
    out.push(g);
  }
  return out;
}

/**
 * S10 + Slice 43：解析 issue 上下文，拆 static/dynamic，再 compose 为 CLI 单字符串。
 * 对外仍返回 string | null（密钥模型不变）。
 */
export async function buildPromptParts(
  issueId: string,
  run?: PromptRunContext,
): Promise<PromptParts | null> {
  const issue = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issue) return null;
  const rows = db
    .select()
    .from(comments)
    .where(eq(comments.issueId, issueId))
    .orderBy(desc(comments.createdAt))
    .limit(K)
    .all()
    .reverse();
  // S3：已定论线程只喂「根 + 结论」，中间来回不再重复占 token。
  // 与 UI 折叠共用同一套判定（comment-thread.ts），避免两处口径漂移。
  const folded = projectThreadsForPrompt(rows);
  const history = folded
    .map((c) => `[${c.authorType}:${c.authorId}] ${c.body}`)
    .join('\n\n');

  // F6：与 resolveRunCwd 同源——project local / workspace / 隔离
  const ctx = resolveIssuePromptContext(issueId);
  const issueBody = [
    `Issue ${issue.identifier}: ${issue.title}`,
    issue.description ? `Description:\n${issue.description}` : '',
    history ? `Recent comments:\n${history}` : '',
    ctx.projectTitle ? `Project: ${ctx.projectTitle}` : '',
    ctx.cwdHint,
    'Please work on this issue in the CLI current working directory described above.',
  ]
    .filter(Boolean)
    .join('\n\n');

  // --- static ---
  let skillBlock: string | null = null;
  if (run?.agentId) {
    const skills = resolveAssignedSkillsForContext(run.agentId, ctx);
    if (skills.length > 0) {
      skillBlock = skills.map((s) => `## Skill: ${s.name}\n${s.body}`).join('\n\n');
    }
  }

  // G18：本地用户 About（Settings 可编辑；空则跳过）
  let aboutBlock: string | null = null;
  const localUser = db.select().from(users).where(eq(users.id, LOCAL_MEMBER.id)).get();
  const about = localUser?.about?.trim();
  if (about) {
    const who = localUser?.name?.trim() || LOCAL_MEMBER.name;
    aboutBlock = `# About the Human Operator\nName: ${who}\n${about}`;
  }

  let instructionsBlock: string | null = null;
  let boundaryBlock: string | null = null;
  if (run?.agentId) {
    const agent = db.select().from(agents).where(eq(agents.id, run.agentId)).get();
    const instructions = agent?.instructions?.trim();
    if (instructions) {
      instructionsBlock = `# Agent Instructions\n${instructions}`;
    }
    const allowedPaths = agent?.allowedPaths?.trim();
    if (allowedPaths) {
      boundaryBlock = `<boundary-fence>\n限制修改路径白名单: ${allowedPaths}\n警告: 禁止修改、删除或新建白名单路径之外的任何文件。\n</boundary-fence>`;
    }
  }

  // S04：protocol/roster 静态；mission 进动态（per-run 任务指令）
  let squadProtocolBlock: string | null = null;
  let missionBlock: string | null = null;
  if (run?.isLeader && run?.squadId) {
    const squad = loadSquadDetail(run.squadId);
    if (squad) {
      // roster 跳过 leader 本人（spec §5，照 multica squad_briefing.go:156）
      const rosterMembers = squad.members.filter((m) => m.agentId !== squad.leaderId);
      const roster = rosterMembers
        .map((m) => `- ${m.name} — [@${m.name}](mention://agent/${m.agentId})`)
        .join('\n');
      squadProtocolBlock = [
        `# Squad Operating Protocol\n${squad.operatingProtocol}`,
        `# Squad Roster\n${roster}`,
      ].join('\n\n');
      if (squad.missionDirective?.trim()) {
        missionBlock = `# Mission Directive\n${squad.missionDirective}`;
      }
    }
  }

  // --- dynamic：wiki / repo note / memory ---
  let wikiBlock: string | null = null;
  let repoContextNote: string | null = null;
  if (ctx.injectRepoContext && ctx.path) {
    if (ctx.mode === 'project_local') {
      const agentsCtx = readAgentsContextFromRoot(ctx.path);
      if (agentsCtx) {
        wikiBlock = wrapRetrievedContext(
          'wiki',
          'Wiki Context',
          `# Project AGENTS / Wiki Snapshot\n${agentsCtx}`,
        );
      }
    } else {
      // workspace 模式：保持 S08 managed 块（控制台工作区 AGENTS.md）
      const wikiBridge = readManagedBlock();
      if (wikiBridge) {
        wikiBlock = wrapRetrievedContext(
          'wiki',
          'Wiki Context',
          `# Project Wiki Snapshot\n${wikiBridge}`,
        );
      }
    }
  } else if (!ctx.injectRepoContext) {
    repoContextNote =
      '# Repo context\n未绑定可用的项目本机目录：已跳过仓库 AGENTS.md 与项目级 .skills 注入。可在项目详情绑定 localPath。';
  }

  // S10：async memory prefetch（spec V8）；无命中 / 失败 → null，不留空标题
  // Slice 25：子 run（parentRunId）默认 skip，避免 fan-out 重复注入
  let memoryBlock: string | null = null;
  if (!run?.skipMemory) {
    memoryBlock = await memoryManager.prefetchForIssue({
      id: issue.id,
      title: issue.title,
      description: issue.description,
    });
  }

  return assembleIssuePromptParts({
    skillBlock,
    aboutBlock,
    instructionsBlock,
    boundaryBlock,
    squadProtocolBlock,
    missionBlock,
    issueBody,
    wikiBlock,
    repoContextNote,
    memoryBlock,
  });
}

// S10：async buildPrompt，await memory prefetch（pgvector 需 embed）
// Slice 43：经 PromptParts 固定顺序 compose；CLI 仍收单字符串
export async function buildPrompt(
  issueId: string,
  run?: PromptRunContext,
): Promise<string | null> {
  const parts = await buildPromptParts(issueId, run);
  if (!parts) return null;
  return composePrompt(parts);
}
