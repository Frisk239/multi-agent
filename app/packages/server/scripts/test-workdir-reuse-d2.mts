/**
 * D2：同 issue 隔离 workdir 路径稳定（再执行沿用）
 * Run: pnpm exec tsx scripts/test-workdir-reuse-d2.mts
 */
import { issueIsolatedWorkDir, chatScratchWorkDir } from '../src/runtime/resolve-run-cwd.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const a = issueIsolatedWorkDir('ws-local', 'issue-abc', 'run-1');
const b = issueIsolatedWorkDir('ws-local', 'issue-abc', 'run-2');
assert(a.mode === 'isolated_issue', a.mode);
assert(b.mode === 'isolated_issue', b.mode);
assert(a.path === b.path, `paths differ:\n${a.path}\n${b.path}`);
assert(a.path.includes('run-workspaces'), a.path);
assert(a.path.endsWith('workdir') || a.path.replace(/\\/g, '/').endsWith('workdir'), a.path);
console.log('PASS same issue → same isolated path', a.path);

const c = issueIsolatedWorkDir('ws-local', 'issue-xyz', 'run-3');
assert(c.path !== a.path, 'different issues should differ');
console.log('PASS different issue → different path');

const d = issueIsolatedWorkDir('ws-local', null, 'run-only-1');
const e = issueIsolatedWorkDir('ws-local', null, 'run-only-2');
assert(d.mode === 'isolated_run', d.mode);
assert(d.path !== e.path, 'QC/no-issue paths by runId');
console.log('PASS no issue → per-run path');

const t1 = chatScratchWorkDir('thread-1', 'run-a');
const t2 = chatScratchWorkDir('thread-1', 'run-b');
assert(t1 === t2, 'chat same thread same dir');
console.log('PASS chat thread stable dir');

console.log('ALL PASS D2 workdir reuse');
process.exit(0);
