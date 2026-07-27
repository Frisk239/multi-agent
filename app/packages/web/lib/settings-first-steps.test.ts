import { describe, it, expect } from 'vitest';
import type { SettingsCheck } from '@ma/shared';
import {
  pickSettingsFirstSteps,
  settingsCheckAnchorId,
  settingsCheckTab,
} from './settings-first-steps';

function check(
  id: string,
  status: SettingsCheck['status'],
  label = id,
): SettingsCheck {
  return { id, label, status, detail: null };
}

describe('settings-first-steps', () => {
  it('returns empty when all ok', () => {
    expect(
      pickSettingsFirstSteps([
        check('cwd', 'ok'),
        check('wiki_llm', 'ok'),
      ]),
    ).toEqual([]);
  });

  it('prioritizes error over warn and caps at 3', () => {
    const steps = pickSettingsFirstSteps([
      check('a', 'warn'),
      check('b', 'ok'),
      check('c', 'error'),
      check('d', 'warn'),
      check('e', 'error'),
      check('f', 'error'),
      check('g', 'warn'),
    ]);
    expect(steps.map((s) => s.id)).toEqual(['c', 'e', 'f']);
  });

  it('fills with warn when fewer than 3 errors', () => {
    const steps = pickSettingsFirstSteps([
      check('cwd', 'error'),
      check('wiki_llm', 'warn'),
      check('embedding', 'warn'),
      check('x', 'warn'),
    ]);
    expect(steps.map((s) => s.id)).toEqual(['cwd', 'wiki_llm', 'embedding']);
  });

  it('maps cwd to workspace tab and others to health', () => {
    expect(settingsCheckTab('cwd')).toBe('workspace');
    expect(settingsCheckTab('wiki_llm')).toBe('health');
    expect(settingsCheckTab('runtime:claude-code')).toBe('health');
  });

  it('builds stable anchor id', () => {
    expect(settingsCheckAnchorId('cwd')).toBe('settings-check-cwd');
  });
});
