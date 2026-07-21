/**
 * C3：skills 用户级不依赖 workspace；project.localPath/.skills 可扫可写
 * Run: pnpm exec tsx scripts/test-skills-project-c3.mts
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const scratch = join(tmpdir(), `ma-c3-skills-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
process.env.DB_PATH = join(scratch, 'c3.db');
delete process.env.MA_WORKSPACE_CWD;
delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { agents, projects, workspaces } = await import('../src/db/schema.js');
const {
  importLocalSkill,
  resolveSkillWriteRoot,
  scanSkills,
  getSkillIndex,
  userSkillsDir,
  workspaceSkillsDir,
} = await import('../src/skill/scanner.js');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const now = Date.now();
const wsId = 'ws-local';
db.insert(workspaces)
  .values({ id: wsId, name: 'C3', description: null, rootPath: null, createdAt: now })
  .run();

// no workspace cwd → user write ok
const userRoot = resolveSkillWriteRoot('user');
assert(userRoot.root && userRoot.root.includes('.multi-agent'), `user root ${userRoot.root}`);
assert(workspaceSkillsDir() == null || !process.env.MA_WORKSPACE_CWD, 'no force ws');
console.log('PASS user write root without workspace');

const srcDir = join(scratch, 'src-skill');
mkdirSync(srcDir, { recursive: true });
writeFileSync(
  join(srcDir, 'SKILL.md'),
  `---\nname: c3-user-skill\ndescription: from test\n---\n\n# hi\n`,
  'utf8',
);

const userWrite = importLocalSkill({
  sourcePath: srcDir,
  target: 'user',
  overwrite: true,
});
assert(userWrite.status === 'created' || userWrite.status === 'updated', JSON.stringify(userWrite));
assert(userWrite.source === 'user', userWrite.source);
scanSkills();
assert(getSkillIndex().has('c3-user-skill'), 'indexed user skill');
console.log('PASS user import without workspace cwd');

// project with localPath
const repo = join(scratch, 'repo');
mkdirSync(repo, { recursive: true });
const projectId = 'proj-c3';
db.insert(projects)
  .values({
    id: projectId,
    workspaceId: wsId,
    title: 'C3 Repo',
    description: null,
    status: 'active',
    localPath: repo,
    createdAt: now,
    updatedAt: now,
  })
  .run();

const projRoot = resolveSkillWriteRoot('project', projectId);
assert(projRoot.root === join(repo, '.skills'), `proj root ${projRoot.root}`);
assert(!projRoot.error, projRoot.error ?? '');

const src2 = join(scratch, 'src-skill-2');
mkdirSync(src2, { recursive: true });
writeFileSync(
  join(src2, 'SKILL.md'),
  `---\nname: c3-proj-skill\ndescription: project skill\n---\n\n# p\n`,
  'utf8',
);
const projWrite = importLocalSkill({
  sourcePath: src2,
  target: 'project',
  projectId,
  overwrite: true,
});
assert(projWrite.status === 'created' || projWrite.status === 'updated', JSON.stringify(projWrite));
assert(projWrite.source === 'project', projWrite.source);
assert(projWrite.projectId === projectId, String(projWrite.projectId));
scanSkills();
const sk = getSkillIndex().get('c3-proj-skill');
assert(sk?.source === 'project', sk?.source);
assert(sk?.projectId === projectId, sk?.projectId ?? '');
assert(sk?.projectTitle === 'C3 Repo', sk?.projectTitle ?? '');
console.log('PASS project localPath skills scan+write');

// project without projectId fails clearly when target=project
const fail = importLocalSkill({
  sourcePath: src2,
  target: 'project',
  overwrite: true,
});
// legacy: no projectId → workspace fallback; without cwd should fail
assert(fail.status === 'failed', `expected fail got ${fail.status}`);
console.log('PASS project without path/id fails or workspace missing');

sqlite.close();
try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  /* ignore */
}
// user skills written under real home — clean test skill if created under user dir
try {
  const { rmSync: rm } = await import('node:fs');
  rm(join(userSkillsDir(), 'c3-user-skill'), { recursive: true, force: true });
} catch {
  /* ignore */
}
console.log('ALL PASS C3 skills project');
process.exit(0);
