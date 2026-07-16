import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments, agentSkills } from '../db/schema.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { getSkillIndex } from '../skill/scanner.js';

// prompt 最近评论条数（spec §6.2 R2，K=20，可配置）
const K = 20;

// buildPrompt —— 组装喂给 CLI 的 user prompt（spec §6.2）：
// Issue 标题 + 描述 + 最近 K 条 comment 文本 + 一句工作指令。
// 临时上下文进 user 侧内容（hermes cache 规则，borrow G-PROMPT-CACHE）。
// S04：leader run 时前置三段 briefing（spec §5，S9 决策——我们无 Instructions 层，
//   briefing 是最高优先级角色指令，逻辑上应先于具体任务）。
// S05：skill 前置于一切（spec §6.1）——skill 是"执行方法论"，逻辑上先于角色 briefing
//   和具体任务。拼接顺序：skillBlock + briefing(if leader) + issueBody，
//   统一用 parts.filter(Boolean).join('\n\n---\n\n')（borrow G-SKILL-INJECT + G-PROMPT-CACHE）。
interface PromptRunContext {
  isLeader: boolean;
  squadId: string | null;
  agentId?: string; // S05：查 agent_skill 分配
}

export function buildPrompt(issueId: string, run?: PromptRunContext): string | null {
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

  // 拼接顺序（S05）：skillBlock + briefing(if leader) + issueBody。
  // 统一数组 filter(Boolean) 模式（替代 S04 的字符串拼接）。
  const parts: string[] = [];
  if (skillBlock) parts.push(skillBlock);

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
