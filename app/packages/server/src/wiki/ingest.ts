// S06 ingest 管线（spec §4.1-4.5）+ S08 成功后 AGENTS.md 桥梁
// DS3 / ADR 0005：issue.projectId → project.localPath/wiki；无效则 global
// Issue status→done 入队后由 worker 调用：读 Issue → raw → LLM → 写页 → index/log → WS → updateAgentsMdBridge
// 失败必须 throw，由 worker catch → failWikiIngestJob 计 failCount（S08 B9/§4.6）
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues, comments, projects } from '../db/schema.js';
import { toIssue, toComment } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';
import {
  saveRaw,
  writeWikiPage,
  appendIndex,
  appendLog,
  listWikiPages,
  readWikiPage,
  hashWikiContent,
  readIssueContentHash,
  writeIssueContentHash,
  type WikiRootOpts,
} from './store.js';
import { createLlm, buildIngestPrompt, generateWikiPage } from './llm.js';
import { generateSlug } from './slug.js';
import { updateAgentsMdBridge } from './agents-bridge.js';

const K = 20; // 最近 K 条 comments（spec §4.4）

export type IngestIssueResult = {
  /** true = content hash 未变，跳过 LLM/写页 */
  skipped: boolean;
  slug?: string;
  reason?: string;
};

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

// 完整 ingest 管线（spec §4.2 + S08 §3.4 + ADR 0005 + Slice 31 content-hash skip）
// 失败 throw；成功（含 skip）由 worker complete job。重试/状态由 ingest-worker 管。
export async function ingestIssue(issueId: string): Promise<IngestIssueResult> {
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
  const rawContent = `# ${issue.identifier}: ${issue.title}\n\n${sourceText}`;
  const contentHash = hashWikiContent(rawContent);
  const slug = generateSlug(issue.identifier, issue.title);

  // 2. Slice 31：同内容 hash → skip LLM / 写页 / index（job 仍 completed + skip log）
  const prevHash = readIssueContentHash(issueId, rootOpts);
  if (prevHash && prevHash === contentHash) {
    appendLog(
      {
        type: 'skip',
        identifier: issue.identifier,
        issueId,
        slug,
        reason: 'content-hash-unchanged',
      },
      rootOpts,
    );
    return { skipped: true, slug, reason: 'content-hash-unchanged' };
  }

  // 3. 存 raw 快照（进 project 或 global wiki）——仅有效 ingest 才写新 raw
  saveRaw(issueId, rawContent, rootOpts);

  // 4. 找出可能重叠的现有 Wiki 页面（增量 Ingest 模式）
  const allPages = listWikiPages(rootOpts);
  let existingContext = '';
  const isIncremental = allPages.length > 0;
  if (isIncremental) {
    const relevantPages = allPages
      .filter((p) => {
        const titleLower = p.title.toLowerCase();
        return sourceText.toLowerCase().includes(titleLower) || issue.title.toLowerCase().includes(titleLower);
      })
      .slice(0, 3); // 截取前 3 个相关页面

    if (relevantPages.length > 0) {
      existingContext = relevantPages
        .map((p) => {
          const page = readWikiPage(p.slug, rootOpts);
          return page ? `--- ${p.title} (${p.slug}.md) ---\n${page.content.slice(0, 1000)}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
    }
  }

  // 5. LLM 生成 wiki 页
  const llm = createLlm();
  const prompt = buildIngestPrompt(issue, sourceText, existingContext);
  const wikiContent = await generateWikiPage(llm, prompt);

  // 6. 写 wiki 页
  writeWikiPage(slug, wikiContent, rootOpts);

  // 7. 更新 index + log（index 幂等：同 slug 不重复 append）
  appendIndex({ slug, title: issue.title, identifier: issue.identifier }, rootOpts);
  appendLog({ type: 'ingest', identifier: issue.identifier, issueId, slug }, rootOpts);
  writeIssueContentHash(issueId, contentHash, rootOpts);

  // 8. WS 通知（spec §4.2 step 6）
  eventBus.publish({
    type: 'wiki:page-created',
    slug,
    title: issue.title,
  });

  // 9. S08 / ADR 0005：更新对应根的 AGENTS.md managed 块
  updateAgentsMdBridge(rootOpts);
  return { skipped: false, slug };
}
