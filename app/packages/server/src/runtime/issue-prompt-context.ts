// F6：Issue prompt 的仓库根 / cwd 语义（与 resolveRunCwd 对齐）
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/client.js';
import { issues, projects } from '../db/schema.js';
import { readManagedBlock } from '../wiki/agents-bridge.js';
import {
  isUsableLocalDirectory,
  normalizeProjectLocalPath,
  resolveRunCwd,
  type ResolvedRunCwd,
} from './resolve-run-cwd.js';

export type IssuePromptContext = {
  mode: ResolvedRunCwd['mode'];
  path: string | null;
  projectId: string | null;
  projectTitle: string | null;
  projectLocalPath: string | null;
  /** 是否从该 path 读 AGENTS / 项目 .skills */
  injectRepoContext: boolean;
  cwdHint: string;
};

/**
 * 与 run-worker 相同优先级：project.localPath > MA_ISSUE_USE_WORKSPACE_CWD > 隔离。
 */
export function resolveIssuePromptContext(issueId: string): IssuePromptContext {
  const issue = db.select().from(issues).where(eq(issues.id, issueId)).get();
  let projectId: string | null = null;
  let projectTitle: string | null = null;
  let projectLocalPath: string | null = null;

  if (issue?.projectId) {
    projectId = issue.projectId;
    const proj = db.select().from(projects).where(eq(projects.id, issue.projectId)).get();
    projectTitle = proj?.title ?? null;
    projectLocalPath = proj?.localPath?.trim() ? proj.localPath : null;
  }

  const resolved = resolveRunCwd({
    kind: 'issue',
    runId: 'prompt-context',
    issueId,
    projectLocalPath,
  });

  const mode = resolved.mode;
  const path = resolved.path;
  const injectRepoContext = mode === 'project_local' || mode === 'workspace';

  let cwdHint: string;
  if (mode === 'project_local' && path) {
    cwdHint = [
      `CLI cwd 是项目本机目录（project local_directory）：${path}`,
      projectTitle ? `所属项目：${projectTitle}。` : '',
      '请只在此目录树内修改文件；AGENTS.md / .skills 已按该仓库解析。',
    ]
      .filter(Boolean)
      .join(' ');
  } else if (mode === 'workspace' && path) {
    cwdHint =
      'CLI cwd 是用户配置的工作区根目录（MA_ISSUE_USE_WORKSPACE_CWD）。仅在此树内修改文件。';
  } else if (mode === 'isolated_issue' || mode === 'isolated_run') {
    cwdHint = [
      'CLI cwd 是本 issue 的隔离工作目录（~/.multi-agent/run-workspaces/.../workdir），',
      '初始为空，不是 multi-agent 控制台源码仓。',
      projectId && !projectLocalPath
        ? 'Issue 已挂项目但未绑定本机目录——未注入该仓 AGENTS.md / .skills；请在项目详情绑定路径。'
        : '未绑定项目本机目录——未注入仓库 AGENTS.md / 项目 .skills。',
      '需要仓库时请自行 clone/checkout 到该目录；不要扫描其它盘符。',
    ].join('');
  } else {
    cwdHint =
      resolved.error ??
      '工作目录未就绪。请检查项目本机路径或 MA_WORKSPACE_CWD / 隔离目录。';
  }

  return {
    mode,
    path,
    projectId,
    projectTitle,
    projectLocalPath,
    injectRepoContext,
    cwdHint,
  };
}

/** 从仓库根读 AGENTS：优先 MA-WIKI managed 块，否则全文截断 */
export function readAgentsContextFromRoot(root: string | null | undefined): string | null {
  if (!root?.trim()) return null;
  const normalized = normalizeProjectLocalPath(root);
  if (!normalized || !isUsableLocalDirectory(normalized)) return null;
  const agentsPath = join(normalized, 'AGENTS.md');
  const managed = readManagedBlock(agentsPath);
  if (managed?.trim()) return managed.trim();
  if (!existsSync(agentsPath)) return null;
  try {
    const raw = readFileSync(agentsPath, 'utf8').trim();
    if (!raw) return null;
    const max = 12_000;
    return raw.length > max ? `${raw.slice(0, max)}\n\n…(AGENTS.md truncated)` : raw;
  } catch {
    return null;
  }
}
