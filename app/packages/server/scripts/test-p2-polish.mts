/**
 * P2 polish smoke: inbox prefs + wiki dir source
 */
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  readInboxPrefs,
  writeInboxPrefs,
  shouldNotifyIssueSuccess,
} from '../src/orchestration/inbox-prefs.js';
import { getWikiDirSource } from '../src/wiki/store.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const prefsFile = join(homedir(), '.multi-agent', 'inbox-prefs.json');
const prevEnv = process.env.MA_INBOX_NOTIFY_SUCCESS;
const prevWiki = process.env.MA_WIKI_DIR;
delete process.env.MA_INBOX_NOTIFY_SUCCESS;

const before = readInboxPrefs();
writeInboxPrefs({ notifyIssueSuccess: true });
assert(readInboxPrefs().notifyIssueSuccess === true, 'write true');
assert(shouldNotifyIssueSuccess() === true, 'should true');
writeInboxPrefs({ notifyIssueSuccess: false });
assert(shouldNotifyIssueSuccess() === false, 'should false');
process.env.MA_INBOX_NOTIFY_SUCCESS = '1';
assert(shouldNotifyIssueSuccess() === true, 'env force');
delete process.env.MA_INBOX_NOTIFY_SUCCESS;
// restore prior
writeInboxPrefs({ notifyIssueSuccess: before.notifyIssueSuccess });
if (prevEnv !== undefined) process.env.MA_INBOX_NOTIFY_SUCCESS = prevEnv;
console.log('PASS inbox prefs');

delete process.env.MA_WIKI_DIR;
const w1 = getWikiDirSource();
assert(w1.source === 'workspace' || w1.source === 'cwd', w1.source);
process.env.MA_WIKI_DIR = join(homedir(), 'ma-wiki-test-root');
const w2 = getWikiDirSource();
assert(w2.source === 'env', w2.source);
assert(w2.path.includes('ma-wiki-test-root'), w2.path);
if (prevWiki === undefined) delete process.env.MA_WIKI_DIR;
else process.env.MA_WIKI_DIR = prevWiki;
console.log('PASS wiki dir source');

console.log('ALL PASS P2 polish');
process.exit(0);
