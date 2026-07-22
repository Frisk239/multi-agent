// S06 ingest 管线（spec §4.1-4.5）+ S08 成功后 AGENTS.md 桥梁
// DS3 / ADR 0005：issue.projectId → project.localPath/wiki；无效则 global
// Issue status→done 入队后由 worker 调用：读 Issue → raw → LLM → 写页 → index/log → WS → updateAgentsMdBridge
// 失败必须 throw，由 worker catch → failWikiIngestJob 计 failCount（S08 B9/§4.6）
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments, projects } from '../db/schema.js';
import { toIssue, toComment } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';
import { saveRaw, writeWikiPage, appendIndex, appendLog, type WikiRootOpts } from './store.js';
import { createLlm, buildIngestPrompt, generateWikiPage } from './llm.js';
import { generateSlug } from './slug.js';
import { updateAgentsMdBridge } from './agents-bridge.js';

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

/** 从 issue 解析 wiki 根：有 project + 有效 localPath → project；否则 {}（global） */
export function wikiRootOptsForIssue(issue: {
  projectId?: string | null;
}): WikiRootOpts {
  const projectId = issue.projectId?.trim();
  if (!projectId) return {};
  const proj = db.select().from(projects).where(eq(projects.id, projectId)).get();
  const localPath = proj?.localPath?.trim();
  if (!localPath) return { projectId };
  return { projectId, projectLocalPath: localPath };
}

// 完整 ingest 管线（spec §4.2 + S08 §3.4 + ADR 0005）
// 失败 throw；成功末尾 updateAgentsMdBridge。重试/状态由 ingest-worker 管。
export async function ingestIssue(issueId: string): Promise<void> {
  // 1. 读 Issue 内容
  const issueRow = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issueRow) throw new Error(`issue ${issueId} 不存在`);
  const issue = toIssue(issueRow);
  const rootOpts = wikiRootOptsForIssue(issue);

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

  // 2. 存 raw 快照（进 project 或 global wiki）
  saveRaw(issueId, `# ${issue.identifier}: ${issue.title}\n\n${sourceText}`, rootOpts);

  // 3. LLM 生成 wiki 页
  const llm = createLlm();
  const prompt = buildIngestPrompt(issue, sourceText);
  const wikiContent = await generateWikiPage(llm, prompt);

  // 4. 写 wiki 页
  const slug = generateSlug(issue.identifier, issue.title);
  writeWikiPage(slug, wikiContent, rootOpts);

  // 5. 更新 index + log
  appendIndex({ slug, title: issue.title, identifier: issue.identifier }, rootOpts);
  appendLog({ type: 'ingest', identifier: issue.identifier, issueId, slug }, rootOpts);

  // 6. WS 通知（spec §4.2 step 6）
  eventBus.publish({
    type: 'wiki:page-created',
    slug,
    title: issue.title,
  });

  // 7. S08 / ADR 0005：更新对应根的 AGENTS.md managed 块
  updateAgentsMdBridge(rootOpts);
}
