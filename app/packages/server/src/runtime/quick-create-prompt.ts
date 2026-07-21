import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentSkills, agents, users } from '../db/schema.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { getSkillIndex } from '../skill/scanner.js';
import { readManagedBlock } from '../wiki/agents-bridge.js';
import { LOCAL_MEMBER } from '../local-member.js';

// buildQuickCreatePrompt —— 学 Multica buildQuickCreatePrompt 的精简中文版。
// 目标：无 Issue 时让 agent 用 `ma issue create` 建卡并回链 origin-run。
// 跳过 issue 历史 / memory prefetch（无 issueId）。

export function buildQuickCreatePrompt(opts: {
  prompt: string;
  runId: string;
  agentId: string;
  assigneeType: 'agent' | 'squad';
  assigneeId: string;
  isLeader: boolean;
  squadId: string | null;
  serverUrl: string;
}): string {
  const parts: string[] = [];

  // skill 注入（与 issue buildPrompt 一致）
  const assigned = db
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.agentId, opts.agentId))
    .all();
  const index = getSkillIndex();
  const skills = assigned
    .map((a) => index.get(a.skillId))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);
  if (skills.length > 0) {
    parts.push(skills.map((s) => `## Skill: ${s.name}\n${s.body}`).join('\n\n'));
  }

  const wikiBridge = readManagedBlock();
  if (wikiBridge) {
    parts.push(`# Project Wiki Snapshot\n${wikiBridge}`);
  }

  const localUser = db.select().from(users).where(eq(users.id, LOCAL_MEMBER.id)).get();
  const about = localUser?.about?.trim();
  if (about) {
    const who = localUser?.name?.trim() || LOCAL_MEMBER.name;
    parts.push(`# About the Human Operator\nName: ${who}\n${about}`);
  }

  const agent = db.select().from(agents).where(eq(agents.id, opts.agentId)).get();
  const instructions = agent?.instructions?.trim();
  if (instructions) {
    parts.push(`# Agent Instructions\n${instructions}`);
  }

  if (opts.isLeader && opts.squadId) {
    const squad = loadSquadDetail(opts.squadId);
    if (squad) {
      const rosterMembers = squad.members.filter((m) => m.agentId !== squad.leaderId);
      const roster = rosterMembers
        .map((m) => `- ${m.name} — [@${m.name}](mention://agent/${m.agentId})`)
        .join('\n');
      parts.push(
        [
          `# Squad Operating Protocol\n${squad.operatingProtocol}`,
          `# Squad Roster\n${roster}`,
          `# Mission Directive\n${squad.missionDirective}`,
        ].join('\n\n'),
      );
    }
  }

  const qcBody = [
    '你正在作为本机多智能体平台的**快速派活（quick-create）助手**运行。',
    '',
    '当前**没有**已存在的 Issue。用户通过「快速派活」提交了下面的自然语言输入。你的唯一正道是调用一次 `ma issue create`，创建规范 Issue（标题/描述由你决定），并回链本次 run。',
    '',
    '## 工作目录',
    '',
    'CLI cwd 是本 run 的隔离目录（~/.multi-agent/run-workspaces/...），不是控制台 monorepo，也不是 process.cwd。',
    '把 `description.md` 写在当前目录；不要去探索或修改其它仓库。',
    '',
    '## User input',
    '',
    `> ${opts.prompt.replace(/\n/g, '\n> ')}`,
    '',
    '## 字段规则',
    '',
    '- **title**：必填。简洁且信息密度高的摘要；保留关键语义，去掉废话。',
    '- **description**：执行 agent 的主上下文，高保真还原用户意图。',
    '  - 优先两段：`User request`（用户原意，保留路径/标识符/术语）+ 可选 `Context`（仅当你确实抓到了外部资源的可核验事实时）。',
    '  - 禁止编造需求、验收标准或实现细节。',
    '  - 多行或含代码/引号/反引号时：先写 `./description.md`，再用 `--description-file ./description.md`（禁止 /tmp）。',
    '- **priority**：urgent|high|medium|low|none，未知则 medium。',
    `- **assignee（强制）**：必须与本次快速派活指派一致，禁止改派。`,
    `  - \`--assignee-type ${opts.assigneeType}\``,
    `  - \`--assignee-id ${opts.assigneeId}\``,
    `- **origin-run（强制）**：\`--origin-run ${opts.runId}\`（或环境变量 MA_RUN_ID 已设时也可省略，但推荐显式传）。`,
    `- **server**：默认 \`MA_SERVER_URL=${opts.serverUrl}\`；CLI 会 POST 到 \`${opts.serverUrl}/api/issues\`。`,
    '',
    '## 输出 / 命令',
    '',
    '运行**恰好一次**（失败也不要重复建卡以免重复）：',
    '',
    '```',
    `ma issue create \\`,
    `  --title "..." \\`,
    `  --description-file ./description.md \\`,
    `  --assignee-type ${opts.assigneeType} \\`,
    `  --assignee-id ${opts.assigneeId} \\`,
    `  --priority medium \\`,
    `  --origin-run ${opts.runId} \\`,
    `  --server ${opts.serverUrl}`,
    '```',
    '',
    '成功后 stdout 为 JSON envelope（`ok:true` + issue）。打印一行 `Created <identifier>: <title>` 后退出。',
    '',
    '## 禁止',
    '',
    '- 禁止假设已有 Issue 去 `get` / 写 comment。',
    '- 禁止改派到其他 agent/squad。',
    '- 禁止跳过 `ma issue create`。',
  ].join('\n');

  parts.push(qcBody);
  return parts.join('\n\n---\n\n');
}
