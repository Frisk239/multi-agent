import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getIssueIdleMs,
  getIssueToolIdleMs,
  getIssueWallTimeoutMs,
  formatDurationMs,
  STALE_RUNNING_MS,
  DEFAULT_ISSUE_IDLE_MS,
  DEFAULT_OPENCODE_IDLE_MS,
  DEFAULT_ISSUE_TOOL_IDLE_MS,
} from './stale-runs';

describe('stale-runs configuration and helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MA_OPENCODE_IDLE_MS;
    delete process.env.MA_ISSUE_IDLE_MS;
    delete process.env.MA_ISSUE_TOOL_IDLE_MS;
    delete process.env.MA_ISSUE_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exports expected default timeout constants', () => {
    expect(STALE_RUNNING_MS).toBe(120_000);
    expect(DEFAULT_ISSUE_IDLE_MS).toBe(30 * 60_000);
    expect(DEFAULT_OPENCODE_IDLE_MS).toBe(10 * 60_000);
    expect(DEFAULT_ISSUE_TOOL_IDLE_MS).toBe(2 * 60 * 60_000);
  });

  it('getIssueIdleMs returns default or opencode specific idle timeout', () => {
    expect(getIssueIdleMs('claude-code')).toBe(DEFAULT_ISSUE_IDLE_MS);
    expect(getIssueIdleMs('opencode')).toBe(DEFAULT_OPENCODE_IDLE_MS);

    process.env.MA_ISSUE_IDLE_MS = '600000';
    expect(getIssueIdleMs('claude-code')).toBe(600_000);

    process.env.MA_OPENCODE_IDLE_MS = '300000';
    expect(getIssueIdleMs('opencode')).toBe(300_000);
  });

  it('getIssueToolIdleMs returns tool idle window', () => {
    expect(getIssueToolIdleMs()).toBe(DEFAULT_ISSUE_TOOL_IDLE_MS);

    process.env.MA_ISSUE_TOOL_IDLE_MS = '3600000';
    expect(getIssueToolIdleMs()).toBe(3_600_000);
  });

  it('getIssueWallTimeoutMs defaults to 0 (disabled)', () => {
    expect(getIssueWallTimeoutMs()).toBe(0);

    process.env.MA_ISSUE_TIMEOUT_MS = '7200000';
    expect(getIssueWallTimeoutMs()).toBe(7_200_000);
  });

  it('formatDurationMs formats ms into human-readable strings', () => {
    expect(formatDurationMs(500)).toBe('1s');
    expect(formatDurationMs(5_000)).toBe('5s');
    expect(formatDurationMs(65_000)).toBe('1m');
    expect(formatDurationMs(3600_000)).toBe('1.0h');
  });
});
