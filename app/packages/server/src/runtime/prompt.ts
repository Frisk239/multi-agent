import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments, agentSkills, agents, agentRuns, users } from '../db/schema.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { getSkillIndex } from '../skill/scanner.js';
import { readManagedBlock } from '../wiki/agents-bridge.js';
import { memoryManager } from '../memory/manager.js';
import { buildQuickCreatePrompt } from './quick-create-prompt.js';
import { LOCAL_MEMBER } from '../local-member.js';

// prompt 最近评论条数（spec §6.2 R2，K=20，可配置）
const K = 20;

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
export async function resolveRunPrompt(
  runRow: typeof agentRuns.$inferSelect,
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
    const parts = [
      `你是智能体「${name}」，正在与用户进行一对一聊天（非 Issue 任务）。`,
      instructions ? `你的指令：\n${instructions}` : null,
      cwdNote,
      '请直接、简洁地回答用户。不要擅自改仓库代码，除非用户明确要求。',
      `用户说：\n${userText}`,
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
  const body = [
    `Issue ${issue.identifier}: ${issue.title}`,
    issue.description ? `Description:\n${issue.description}` : '',
    history ? `Recent comments:\n${history}` : '',
    'Please work on this issue in the current workspace.',
  ]
    .filter(Boolean)
    .join('\n\n');

  // S05 skill 注入（照 hermes，进 user prompt 不进 system prompt，保 cache）。
  // 查 agent_skill 分配 + join 内存索引（scanner 的 getSkillIndex，不进 DB）。
  let skillBlock: string | null = null;
  if (run?.agentId) {
    const assigned = db.select().from(agentSkills).where(eq(agentSkills.agentId, run.agentId)).all();
    const index = getSkillIndex();
    const skills = assigned
      .map((a) => index.get(a.skillId))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);
    if (skills.length > 0) {
      skillBlock = skills.map((s) => `## Skill: ${s.name}\n${s.body}`).join('\n\n');
    }
  }

  // 拼接顺序：skill → wiki → memory → user about → agent instructions → briefing → body。
  // 统一数组 filter(Boolean) 模式（替代 S04 的字符串拼接）。
  const parts: string[] = [];
  if (skillBlock) parts.push(skillBlock);

  // S08：AGENTS.md managed 块注入（spec §3.5 B6）；空则跳过
  const wikiBridge = readManagedBlock();
  if (wikiBridge) {
    parts.push(`# Project Wiki Snapshot\n${wikiBridge}`);
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
