/**
 * F6：issue prompt 按 project.localPath 注入 AGENTS；isolated 跳过 workspace project skills
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { agents, agentSkills, issues, projects } from '../src/db/schema.js';
import { buildPrompt, resolveAssignedSkillsForContext } from '../src/runtime/prompt.js';
import { resolveIssuePromptContext } from '../src/runtime/issue-prompt-context.js';
import { loadSkillsFromRoot } from '../src/skill/scanner.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const root = join(tmpdir(), `ma-f6-prompt-${Date.now()}`);
mkdirSync(join(root, '.skills', 'demo-skill'), { recursive: true });
writeFileSync(
  join(root, 'AGENTS.md'),
  [
    '<!-- BEGIN MA-WIKI (auto-managed; do not edit) -->',
    '## Project Wiki Snapshot',
    '- F6-TEST-MARKER-AGENTS',
    '<!-- END MA-WIKI -->',
    '',
  ].join('\n'),
  'utf8',
);
writeFileSync(
  join(root, '.skills', 'demo-skill', 'SKILL.md'),
  `---
name: demo-skill
description: from project local
---
# Demo Skill Body F6-PROJECT-SKILL
`,
  'utf8',
);

const agent = db.select().from(agents).all()[0];
assert(agent, 'need agent');

const projectId = crypto.randomUUID();
const now = Date.now();
db.insert(projects)
  .values({
    id: projectId,
    workspaceId: 'ws-local',
    title: 'F6 Test Project',
    description: null,
    status: 'active',
    localPath: root,
    createdAt: now,
    updatedAt: now,
  })
  .run();

// ensure agent has skill assignment named demo-skill if possible
const existingAssign = db
  .select()
  .from(agentSkills)
  .where(eq(agentSkills.agentId, agent.id))
  .all();
const hasDemo = existingAssign.some((a) => a.skillId === 'demo-skill');
if (!hasDemo) {
  db.insert(agentSkills)
    .values({ agentId: agent.id, skillId: 'demo-skill' })
    .run();
}

const issueId = crypto.randomUUID();
db.insert(issues)
  .values({
    id: issueId,
    workspaceId: 'ws-local',
    identifier: `F6-${Date.now().toString(36).slice(-4)}`,
    title: 'F6 prompt context test',
    description: 'desc',
    status: 'todo',
    priority: 'none',
    assigneeType: 'agent',
    assigneeId: agent.id,
    creatorType: 'member',
    creatorId: 'mem-local',
    position: 0,
    projectId,
    createdAt: now,
    updatedAt: now,
  })
  .run();

try {
  const ctx = resolveIssuePromptContext(issueId);
  assert(ctx.mode === 'project_local', `mode=${ctx.mode}`);
  assert(ctx.path === root || ctx.path?.replace(/\\/g, '/') === root.replace(/\\/g, '/'), `path=${ctx.path}`);
  assert(ctx.injectRepoContext, 'inject');
  console.log('PASS context', ctx.mode, ctx.path);

  const loaded = loadSkillsFromRoot(root);
  assert(loaded.get('demo-skill')?.body.includes('F6-PROJECT-SKILL'), 'load skill');
  console.log('PASS loadSkillsFromRoot');

  const skills = resolveAssignedSkillsForContext(agent.id, ctx);
  const demo = skills.find((s) => s.name === 'demo-skill');
  assert(demo?.body.includes('F6-PROJECT-SKILL'), 'assigned prefers project body');
  console.log('PASS skill overlay');

  const prompt = await buildPrompt(issueId, {
    isLeader: false,
    squadId: null,
    agentId: agent.id,
  });
  assert(prompt, 'prompt');
  assert(prompt!.includes('F6-TEST-MARKER-AGENTS'), 'AGENTS in prompt');
  assert(prompt!.includes('F6-PROJECT-SKILL'), 'project skill in prompt');
  assert(prompt!.includes('project local') || prompt!.includes('本机目录'), 'cwd hint');
  console.log('PASS buildPrompt project_local');

  // clear localPath → isolated, should note skip AGENTS
  db.update(projects)
    .set({ localPath: null, updatedAt: Date.now() })
    .where(eq(projects.id, projectId))
    .run();
  const ctx2 = resolveIssuePromptContext(issueId);
  assert(
    ctx2.mode === 'isolated_issue' || ctx2.mode === 'isolated_run',
    `isolated mode=${ctx2.mode}`,
  );
  const prompt2 = await buildPrompt(issueId, {
    isLeader: false,
    squadId: null,
    agentId: agent.id,
  });
  assert(prompt2?.includes('未绑定') || prompt2?.includes('跳过'), 'skip note');
  assert(!prompt2?.includes('F6-TEST-MARKER-AGENTS'), 'no project AGENTS when isolated');
  console.log('PASS isolated skips repo AGENTS');

  console.log('ALL PASS');
} finally {
  // cleanup rows
  db.delete(issues).where(eq(issues.id, issueId)).run();
  db.delete(projects).where(eq(projects.id, projectId)).run();
  if (!hasDemo) {
    db.delete(agentSkills)
      .where(eq(agentSkills.agentId, agent.id))
      .run();
    // only delete if we inserted demo-skill alone - safer leave assignment
  }
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
