import { describe, it, expect } from 'vitest';
import { AUTOMATION_PRESETS } from './automation-presets';
import { AutomationScheduleKind } from './schema';

describe('AUTOMATION_PRESETS', () => {
  it('should be a non-empty array of presets', () => {
    expect(Array.isArray(AUTOMATION_PRESETS)).toBe(true);
    expect(AUTOMATION_PRESETS.length).toBeGreaterThan(0);
  });

  it('should contain unique preset IDs', () => {
    const ids = AUTOMATION_PRESETS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid scheduleKind for each preset', () => {
    for (const preset of AUTOMATION_PRESETS) {
      const parsedKind = AutomationScheduleKind.safeParse(preset.scheduleKind);
      expect(parsedKind.success).toBe(true);
    }
  });

  it('should have required fields filled in for all presets', () => {
    for (const preset of AUTOMATION_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.title).toBeTruthy();
      expect(preset.summary).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.titleTemplate).toBeDefined();
      expect(preset.bodyTemplate).toBeDefined();
    }
  });

  it('should contain expected preset IDs in gallery', () => {
    const ids = AUTOMATION_PRESETS.map((p) => p.id);
    expect(ids).toContain('daily_news');
    expect(ids).toContain('bug_triage');
    expect(ids).toContain('weekly_progress');
  });
});
