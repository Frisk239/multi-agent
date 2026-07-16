// S06 ingest 管线（spec §4.1-4.5）
// Issue status→done 时触发：读 Issue 内容 → 存 raw → LLM 生成 wiki 页 → 写文件 → 更新 index/log → WS 通知
// 异步 fire-and-forget，调用方负责 .catch()（spec W7/W8）
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments } from '../db/schema.js';
import { toIssue, toComment } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';
import { saveRaw, writeWikiPage, appendIndex, appendLog } from './store.js';
import { createLlm, buildIngestPrompt, generateWikiPage } from './llm.js';
import { generateSlug } from './slug.js';

const K = 20; // 最近 K 条 comments（spec §4.4）

// 格式化 Issue + comments 为 sourceText（给 LLM 的输入）
function formatSource(
  issue: { description: string | null },
  commentRows: { type: string; authorLabel: string; body: string; createdAt: number }[],
): string {
  const parts: string[] = [];
  parts.push(`Description: ${issue.description ?? '(无)'}`);
  if (commentRows.length > 0) {
    parts.push(`\nComments（最近 ${commentRows.length} 条）:`);
    for (const c of commentRows) {
      parts.push(`\n[${c.type}] ${c.authorLabel}: ${c.body}`);
    }
  }
  return parts.join('\n');
}

// 完整 ingest 管线（spec §4.2）
// 调用方（issues.ts PUT handler）负责 void ingestIssue(id).catch(...)
export async function ingestIssue(issueId: string): Promise<void> {
  // 1. 读 Issue 内容
  const issueRow = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issueRow) throw new Error(`issue ${issueId} 不存在`);
  const issue = toIssue(issueRow);

  // 读最近 K 条 comments（按 createdAt DESC，取前 K）
  const commentRows = db
    .select()
    .from(comments)
    .where(eq(comments.issueId, issueId))
    .orderBy(desc(comments.createdAt))
    .limit(K)
    .all()
    .reverse(); // 反转成时间正序（取的是最近 K 条，展示时按正序）
  const commentApis = commentRows.map((r) => {
    const c = toComment(r);
    return { type: c.type, authorLabel: c.authorLabel, body: c.body, createdAt: new Date(c.createdAt).getTime() };
  });
  const sourceText = formatSource(issue, commentApis);

  // 2. 存 raw 快照
  saveRaw(issueId, `# ${issue.identifier}: ${issue.title}\n\n${sourceText}`);

  // 3. LLM 生成 wiki 页
  const llm = createLlm();
  const prompt = buildIngestPrompt(issue, sourceText);
  const wikiContent = await generateWikiPage(llm, prompt);

  // 4. 写 wiki 页
  const slug = generateSlug(issue.identifier, issue.title);
  writeWikiPage(slug, wikiContent);

  // 5. 更新 index + log
  appendIndex({ slug, title: issue.title, identifier: issue.identifier });
  appendLog({ type: 'ingest', identifier: issue.identifier, issueId, slug });

  // 6. WS 通知（spec §4.2 step 6）
  eventBus.publish({
    type: 'wiki:page-created',
    slug,
    title: issue.title,
  });
}
