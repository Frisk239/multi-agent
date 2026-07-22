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

// buildPrompt —— 组装喂给 CLI 的 user prompt（spec §6.2）：
// Issue 标题 + 描述 + 最近 K 条 comment 文本 + 一句工作指令。
// 临时上下文进 user 侧内容（hermes cache 规则，borrow G-PROMPT-CACHE）。
// S04：leader run 时前置三段 briefing（spec §5，S9 决策——我们无 Instructions 层，
//   briefing 是最高优先级角色指令，逻辑上应先于具体任务）。
// S05：skill 前置于一切（spec §6.1）——skill 是"执行方法论"，逻辑上先于角色 briefing
//   和具体任务。
// S08：wiki bridge；S09：memory prefetch。
// bu02：agent.instructions 注入（非 leader briefing 替代）。
// 拼接顺序：skill → wiki → memory → **agent instructions** → briefing(if leader) → issueBody，
// 统一用 parts.filter(Boolean).join('\n\n---\n\n')（borrow G-SKILL-INJECT + G-PROMPT-CACHE）。
interface PromptRunContext {
  isLeader: boolean;
  squadId: string | null;
  agentId?: string; // S05：查 agent_skill 分配；bu02：查 instructions
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
  opts?: { skipChatHistoryForResume?: boolean },
): Promise<string | null> {
  const kind = (runRow.kind as 'issue' | 'quick_create' | 'chat') ?? 'issue';
  if (kind === 'chat') {
    const userText = runRow.quickPrompt?.trim();
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
    // 多轮：默认注入同 thread 历史（假 resume）。
    // DS1：真 CLI resume 时跳过历史块，避免双倍上下文（ADR 0004）。
    const threadId = runRow.chatThreadId?.trim() ?? '';
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
  return buildPrompt(runRow.issueId, {
    isLeader: runRow.isLeader === 1,
    squadId: runRow.squadId,
    agentId: runRow.agentId,
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

// S10：async buildPrompt，await memory prefetch（pgvector 需 embed）
export async function buildPrompt(
  issueId: string,
  run?: PromptRunContext,
): Promise<string | null> {
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
  const history = rows
    .map((c) => `[${c.authorType}:${c.authorId}] ${c.body}`)
    .join('\n\n');

  // F6：与 resolveRunCwd 同源——project local / workspace / 隔离
  const ctx = resolveIssuePromptContext(issueId);
  const body = [
    `Issue ${issue.identifier}: ${issue.title}`,
    issue.description ? `Description:\n${issue.description}` : '',
    history ? `Recent comments:\n${history}` : '',
    ctx.projectTitle ? `Project: ${ctx.projectTitle}` : '',
    ctx.cwdHint,
    'Please work on this issue in the CLI current working directory described above.',
  ]
    .filter(Boolean)
    .join('\n\n');

  // S05 + F6 skill 注入
  let skillBlock: string | null = null;
  if (run?.agentId) {
    const skills = resolveAssignedSkillsForContext(run.agentId, ctx);
    if (skills.length > 0) {
      skillBlock = skills.map((s) => `## Skill: ${s.name}\n${s.body}`).join('\n\n');
    }
  }

  // 拼接顺序：skill → wiki/AGENTS → memory → user about → agent instructions → briefing → body。
  const parts: string[] = [];
  if (skillBlock) parts.push(skillBlock);

  // F6：AGENTS 相对仓库根；isolated 不注入 workspace AGENTS（错仓）
  if (ctx.injectRepoContext && ctx.path) {
    if (ctx.mode === 'project_local') {
      const agentsCtx = readAgentsContextFromRoot(ctx.path);
      if (agentsCtx) {
        parts.push(`# Project AGENTS / Wiki Snapshot\n${agentsCtx}`);
      }
    } else {
      // workspace 模式：保持 S08 managed 块（控制台工作区 AGENTS.md）
      const wikiBridge = readManagedBlock();
      if (wikiBridge) {
        parts.push(`# Project Wiki Snapshot\n${wikiBridge}`);
      }
    }
  } else if (!ctx.injectRepoContext) {
    parts.push(
      '# Repo context\n未绑定可用的项目本机目录：已跳过仓库 AGENTS.md 与项目级 .skills 注入。可在项目详情绑定 localPath。',
    );
  }

  // S10：async memory prefetch（spec V8）；无命中 / 失败 → null，不留空标题
  const memoryBlock = await memoryManager.prefetchForIssue({
    id: issue.id,
    title: issue.title,
    description: issue.description,
  });
  if (memoryBlock) parts.push(memoryBlock);

  // G18：本地用户 About（Settings 可编辑；空则跳过）
  const localUser = db.select().from(users).where(eq(users.id, LOCAL_MEMBER.id)).get();
  const about = localUser?.about?.trim();
  if (about) {
    const who = localUser?.name?.trim() || LOCAL_MEMBER.name;
    parts.push(`# About the Human Operator\nName: ${who}\n${about}`);
  }

  // bu02：agent instructions（在 memory 之后、briefing 之前）
  if (run?.agentId) {
    const agent = db.select().from(agents).where(eq(agents.id, run.agentId)).get();
    const instructions = agent?.instructions?.trim();
    if (instructions) {
      parts.push(`# Agent Instructions\n${instructions}`);
    }
  }

  // S04 briefing 前置（spec §5 S9）
  if (run?.isLeader && run?.squadId) {
    const squad = loadSquadDetail(run.squadId);
    if (squad) {
      // roster 跳过 leader 本人（spec §5，照 multica squad_briefing.go:156）
      const rosterMembers = squad.members.filter((m) => m.agentId !== squad.leaderId);
      const roster = rosterMembers
        .map((m) => `- ${m.name} — [@${m.name}](mention://agent/${m.agentId})`)
        .join('\n');
      const briefing = [
        `# Squad Operating Protocol\n${squad.operatingProtocol}`,
        `# Squad Roster\n${roster}`,
        `# Mission Directive\n${squad.missionDirective}`,
      ].join('\n\n');
      parts.push(briefing);
    }
  }
  parts.push(body);
  return parts.join('\n\n---\n\n');
}
