#!/usr/bin/env node
/**
 * Thin repo-doc gate (Hermes check_documentation intent, not a YAML parser).
 * Exit 0 only if required entry files exist and every docs/adr/*.md has an
 * allowed Status line.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = [
  'AGENTS.md',
  'CONTEXT.md',
  'docs/agents/workflow.md',
  'docs/agents/merge.md',
  'docs/agents/engineering.md',
  'docs/adr/0007-engineering-mode-after-hermes.md',
  'design/roadmap.md',
];
const ALLOWED_ADR_STATUS = /Status:\s*\*{0,2}\s*(Accepted|Superseded)\b/i;
const FROZEN_CI_SNIPPETS = ['pnpm check', 'node scripts/check-docs.mjs'];

function fail(msg) {
  console.error(`check-docs: ${msg}`);
  process.exit(1);
}

for (const rel of REQUIRED) {
  if (!existsSync(join(ROOT, rel))) fail(`missing required file: ${rel}`);
}

const adrDir = join(ROOT, 'docs/adr');
const adrFiles = readdirSync(adrDir).filter((f) => f.endsWith('.md'));
if (adrFiles.length === 0) fail('no ADR markdown in docs/adr');
for (const f of adrFiles) {
  const body = readFileSync(join(adrDir, f), 'utf8');
  if (!ALLOWED_ADR_STATUS.test(body)) {
    fail(`${f} needs a Status line of Accepted or Superseded`);
  }
}

const workflow = readFileSync(join(ROOT, '.github/workflows/feat-branch-ci.yml'), 'utf8');
for (const snippet of FROZEN_CI_SNIPPETS) {
  if (!workflow.includes(snippet)) {
    fail(`CI workflow must keep command: ${snippet}`);
  }
}

console.log(
  `check-docs: ok (${REQUIRED.length} entries, ${adrFiles.length} ADRs, CI freeze)`,
);
