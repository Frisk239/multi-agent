/**
 * F1：project.localPath 优先于隔离 workdir
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveRunCwd,
  isUsableLocalDirectory,
} from '../src/runtime/resolve-run-cwd.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const prev = process.env.MA_ISSUE_USE_WORKSPACE_CWD;
delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;

const dir = join(tmpdir(), `ma-proj-local-${Date.now()}`);
mkdirSync(dir, { recursive: true });

try {
  const withPath = resolveRunCwd({
    kind: 'issue',
    runId: 'run-1',
    issueId: 'issue-1',
    projectLocalPath: dir,
  });
  assert(withPath.mode === 'project_local', `mode=${withPath.mode}`);
  assert(withPath.path === dir, `path=${withPath.path}`);
  assert(withPath.exists, 'exists');
  console.log('PASS project_local', withPath.path);

  const bad = resolveRunCwd({
    kind: 'issue',
    runId: 'run-2',
    issueId: 'issue-2',
    projectLocalPath: join(dir, 'no-such-subdir-xyz'),
  });
  assert(bad.mode === 'none', `bad mode=${bad.mode}`);
  assert(!bad.exists, 'bad not exists');
  assert(bad.error?.includes('无效') || bad.error?.includes('目录'), bad.error ?? '');
  console.log('PASS invalid path blocked');

  const isolated = resolveRunCwd({
    kind: 'issue',
    runId: 'run-3',
    issueId: 'issue-3',
  });
  assert(
    isolated.mode === 'isolated_issue' || isolated.mode === 'isolated_run',
    `isolated mode=${isolated.mode}`,
  );
  assert(isolated.exists, 'isolated ok');
  console.log('PASS no project → isolated', isolated.path);

  assert(isUsableLocalDirectory(dir), 'isUsable');
  console.log('ALL PASS');
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (prev === undefined) delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;
  else process.env.MA_ISSUE_USE_WORKSPACE_CWD = prev;
}
