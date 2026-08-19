import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('check-docs passes on this repo', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/check-docs.mjs')], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /check-docs: ok/);
});
