import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments } from '../db/schema.js';

// prompt 最近评论条数（spec §6.2 R2，K=20，可配置）
const K = 20;

// buildPrompt —— 组装喂给 CLI 的 user prompt（spec §6.2）：
// Issue 标题 + 描述 + 最近 K 条 comment 文本 + 一句工作指令。
// 临时上下文进 user 侧内容（hermes cache 规则，borrow G-PROMPT-CACHE）。
export function buildPrompt(issueId: string): string | null {
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
  return [
    `Issue ${issue.identifier}: ${issue.title}`,
    issue.description ? `Description:\n${issue.description}` : '',
    history ? `Recent comments:\n${history}` : '',
    'Please work on this issue in the current workspace.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
