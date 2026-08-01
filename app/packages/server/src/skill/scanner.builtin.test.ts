/**
 * W6 · builtin 内置自省 skill 索引测试。
 * 验证：scanSkills 收录 src/skill/builtin/ 下 3 个 ma-* skill（source=builtin）、
 * 用户级同名 skill 可覆盖内置、refresh 后索引可恢复。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from '../__test-helpers__/test-db.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
  homes: [] as string[],
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('no db');
    return state.db;
  },
  sqlite: { prepare: () => ({ get: () => ({ '1': 1 }) }) },
  getSqliteHardeningInfo: () => ({
    path: ':memory:', busyTimeoutMs: 5000, journalMode: 'memory', foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));
// 隔离 HOME：用户级 skill 目录指向临时目录（可注入同名覆盖）
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => state.homes[0] ?? actual.homedir(),
  };
});

import { builtinSkillsDir, getSkillIndex, scanSkills } from './scanner.js';

describe('W6 builtin skills', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    for (const h of state.homes) rmSync(h, { recursive: true, force: true });
    state.homes = [];
  });

  it('scanSkills indexes the 3 ma-* builtin skills with source=builtin', () => {
    scanSkills();
    const idx = getSkillIndex();
    const builtins = [...idx.values()].filter((s) => s.source === 'builtin');
    const names = builtins.map((s) => s.name).sort();
    expect(names).toEqual(['ma-mentioning', 'ma-squads', 'ma-working-on-issues']);
    for (const s of builtins) {
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.body.length).toBeGreaterThan(100);
      expect(s.path).toContain('builtin');
    }
    expect(builtinSkillsDir()).toContain('builtin');
  });

  it('a user-level skill with the same name overrides the builtin', () => {
    const home = mkdtempSync(join(tmpdir(), 'ma-skill-home-'));
    state.homes = [home];
    const userSkills = join(home, '.multi-agent', 'skills');
    mkdirSync(userSkills, { recursive: true });
    writeFileSync(
      join(userSkills, 'ma-mentioning.md'),
      '---\nname: ma-mentioning\ndescription: 用户自定义覆盖\n---\n# 自定义正文',
    );
    scanSkills();
    const idx = getSkillIndex();
    const s = idx.get('ma-mentioning');
    expect(s?.source).toBe('user');
    expect(s?.body).toContain('自定义正文');
  });

  it('re-scan restores builtins when the user override is removed', () => {
    const home = mkdtempSync(join(tmpdir(), 'ma-skill-home-'));
    state.homes = [home];
    const userSkills = join(home, '.multi-agent', 'skills');
    mkdirSync(userSkills, { recursive: true });
    writeFileSync(
      join(userSkills, 'ma-squads.md'),
      '---\nname: ma-squads\ndescription: 临时覆盖\n---\n# x',
    );
    scanSkills();
    expect(getSkillIndex().get('ma-squads')?.source).toBe('user');
    rmSync(userSkills, { recursive: true, force: true });
    scanSkills();
    expect(getSkillIndex().get('ma-squads')?.source).toBe('builtin');
  });
});
