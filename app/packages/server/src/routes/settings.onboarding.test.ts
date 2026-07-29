import { describe, expect, it } from 'vitest';
import { calculateDay0Progress } from './settings.js';

describe('calculateDay0Progress', () => {
  const base = {
    agents: [{ archivedAt: null }, { archivedAt: 1 }],
    projects: [{ localPath: 'D:\\repo' }],
    issues: [{ id: 'i-1', identifier: 'FRI-1', assigneeType: 'agent', assigneeId: 'a-1' }],
    runs: [
      { id: 'r-old', issueId: 'i-1', status: 'completed', createdAt: 1 },
      { id: 'r-live', issueId: 'i-1', status: 'running', createdAt: 2 },
    ],
    hasRuntimes: true,
    isUsableProjectPath: (path: string) => path === 'D:\\repo',
  };

  it('requires all real conditions and prefers the active linked run', () => {
    expect(calculateDay0Progress(base)).toMatchObject({
      activeAgentCount: 1,
      validProjectCount: 1,
      firstRunId: 'r-live',
      completed: true,
    });
  });

  it('does not complete for invalid project or unassigned issue', () => {
    expect(calculateDay0Progress({
      ...base,
      projects: [{ localPath: 'D:\\missing' }],
      issues: [{ ...base.issues[0]!, assigneeType: null, assigneeId: null }],
    })).toMatchObject({
      hasValidProject: false,
      hasAssignedIssueRun: false,
      completed: false,
    });
  });
});
