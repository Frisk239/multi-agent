import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments } from '../db/schema.js';
import { loadSquadDetail } from '../db/squad-loader.js';

// prompt 最近评论条数（spec §6.2 R2，K=20，可配置）
const K = 20;

// buildPrompt —— 组装喂给 CLI 的 user prompt（spec §6.2）：
// Issue 标题 + 描述 + 最近 K 条 comment 文本 + 一句工作指令。
// 临时上下文进 user 侧内容（hermes cache 规则，borrow G-PROMPT-CACHE）。
// S04：leader run 时前置三段 briefing（spec §5，S9 决策——我们无 Instructions 层，
//   briefing 是最高优先级角色指令，逻辑上应先于具体任务）。
interface PromptRunContext {
  isLeader: boolean;
  squadId: string | null;
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
      return briefing + '\n\n---\n\n' + body;
    }
  }
  return body;
}
