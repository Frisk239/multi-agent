/**
 * Day-0 E1–E4 后端/纯逻辑烟测
 * Run: pnpm exec tsx scripts/test-day0-e1-e4.mts
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getWikiDir } from '../src/wiki/store.js';
import {
  listIsolatedWorkspaces,
  cleanupIsolatedWorkspaces,
} from '../src/orchestration/isolated-workspaces.js';
import { memoryManager } from '../src/memory/manager.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// E3 wiki root
const wikiDir = getWikiDir();
assert(wikiDir.includes('wiki') || wikiDir.endsWith('wiki'), wikiDir);
console.log('PASS wiki root', wikiDir);

const mem = memoryManager.getStatus();
assert(mem.perProject === false, 'memory perProject');
assert(typeof mem.note === 'string' && mem.note.length > 0, 'memory note');
console.log('PASS memory honesty', mem.backend, mem.note.slice(0, 40));

// E4 isolated list/cleanup on a disposable slot under real ~/.multi-agent
const stamp = `day0-test-${Date.now()}`;
const slot = join(homedir(), '.multi-agent', 'run-workspaces', 'ws-test', stamp);
const workdir = join(slot, 'workdir');
mkdirSync(workdir, { recursive: true });
writeFileSync(join(workdir, 'marker.txt'), 'x', 'utf8');

const listed = listIsolatedWorkspaces();
const hit = listed.find((e) => e.path.replace(/\\/g, '/').includes(stamp));
assert(hit, 'listed new isolated dir');
console.log('PASS list isolated', hit!.id);

const cleaned = cleanupIsolatedWorkspaces({ ids: [hit!.id] });
assert(cleaned.deleted.includes(hit!.id), JSON.stringify(cleaned));
assert(!existsSync(slot), 'slot removed');
console.log('PASS cleanup isolated');

// refuse empty
const empty = cleanupIsolatedWorkspaces({});
assert(empty.skipped.length > 0, 'empty cleanup skipped');

// safety: cannot invent id outside
const bad = cleanupIsolatedWorkspaces({ ids: ['run:nope/nope'] });
assert(bad.deleted.length === 0, 'bad id not deleted');
console.log('PASS cleanup guards');

try {
  rmSync(join(homedir(), '.multi-agent', 'run-workspaces', 'ws-test'), {
    recursive: true,
    force: true,
  });
} catch {
  /* ignore */
}

console.log('ALL PASS day0 E3/E4 smoke');
process.exit(0);
