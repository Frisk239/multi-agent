import { describe, it, expect } from 'vitest';
import { toIssueLabel, toAgentRun } from './reshape';

describe('reshape transformers', () => {
  describe('toIssueLabel', () => {
    it('transforms label DB row to API IssueLabel object with ISO dates', () => {
      const now = Date.now();
      const row = {
        id: 'lbl-1',
        workspaceId: 'ws-local',
        name: 'bug',
        color: '#ff0000',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const result = toIssueLabel(row);
      expect(result.id).toBe('lbl-1');
      expect(result.name).toBe('bug');
      expect(result.color).toBe('#ff0000');
      expect(result.archivedAt).toBeNull();
      expect(result.createdAt).toBe(new Date(now).toISOString());
    });

    it('formats archivedAt date when non-null', () => {
      const now = Date.now();
      const row = {
        id: 'lbl-2',
        workspaceId: 'ws-local',
        name: 'deprecated',
        color: '#888888',
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const result = toIssueLabel(row);
      expect(result.archivedAt).toBe(new Date(now).toISOString());
    });
  });

  describe('toAgentRun', () => {
    it('transforms agent run row to API AgentRun object', () => {
      const now = Date.now();
      const row = {
        id: 'run-100',
        workspaceId: 'ws-local',
        kind: 'issue' as const,
        issueId: 'iss-1',
        chatThreadId: null,
        projectId: null,
        agentId: 'agt-1',
        status: 'completed' as const,
        failureReason: null,
        error: null,
        startedAt: now,
        finishedAt: now,
        lastHeartbeatAt: now,
        isLeader: 0,
        squadId: null,
        rerunOfRunId: null,
        quickPrompt: null,
        runtime: 'claude-code' as const,
        cwdMode: 'project_local' as const,
        cwdPath: '/repo',
        tokensInput: 100,
        tokensOutput: 50,
        tokensCacheRead: 0,
        tokensCacheWrite: 0,
        createdAt: now,
        updatedAt: now,
      };

      const result = toAgentRun(row as any);
      expect(result.id).toBe('run-100');
      expect(result.agentId).toBe('agt-1');
      expect(result.status).toBe('completed');
      expect(result.tokensInput).toBe(100);
      expect(result.tokensOutput).toBe(50);
      expect(result.finishedAt).toBe(new Date(now).toISOString());
      // Slice 28：默认无价表 → costUsd null + uncosted（有 token 时）
      expect(result.costUsd).toBeNull();
      expect(result.uncosted).toBe(true);
    });
  });
});
