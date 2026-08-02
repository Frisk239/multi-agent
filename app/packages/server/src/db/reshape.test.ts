import { describe, it, expect } from 'vitest';
import { toIssueLabel, toAgentRun, toObservedAgentRun } from './reshape';

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
        waitingLocalEnteredAt: null,
        prepareLeaseExpiresAt: null,
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
      // Slice 66：非 waiting / 未写 → null
      expect(result.waitingLocalEnteredAt).toBeNull();
      // Slice 68：稳定/终态 → null
      expect(result.prepareLeaseExpiresAt).toBeNull();
    });

    it('maps waitingLocalEnteredAt epoch ms when present (Slice 66)', () => {
      const now = Date.now();
      const entered = now - 12_000;
      const row = {
        id: 'run-wait-1',
        kind: 'issue' as const,
        issueId: 'iss-1',
        chatThreadId: null,
        projectId: null,
        agentId: 'agt-1',
        status: 'waiting_local_directory' as const,
        failureReason: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: now,
        waitingLocalEnteredAt: entered,
        prepareLeaseExpiresAt: null,
        isLeader: 0,
        squadId: null,
        rerunOfRunId: null,
        quickPrompt: null,
        runtime: 'claude-code' as const,
        cwdMode: 'project_local' as const,
        cwdPath: '/repo',
        tokensInput: null,
        tokensOutput: null,
        tokensCacheRead: null,
        tokensCacheWrite: null,
        createdAt: now - 60_000,
      };

      const result = toAgentRun(row as any);
      expect(result.status).toBe('waiting_local_directory');
      expect(result.waitingLocalEnteredAt).toBe(entered);
    });

    it('maps prepareLeaseExpiresAt epoch ms when present (Slice 68)', () => {
      const now = Date.now();
      const lease = now + 120_000;
      const row = {
        id: 'run-lease-1',
        kind: 'issue' as const,
        issueId: 'iss-1',
        chatThreadId: null,
        projectId: null,
        agentId: 'agt-1',
        status: 'running' as const,
        failureReason: null,
        error: null,
        startedAt: now,
        finishedAt: null,
        lastHeartbeatAt: now,
        waitingLocalEnteredAt: null,
        prepareLeaseExpiresAt: lease,
        isLeader: 0,
        squadId: null,
        rerunOfRunId: null,
        quickPrompt: null,
        runtime: 'claude-code' as const,
        cwdMode: 'project_local' as const,
        cwdPath: '/repo',
        tokensInput: null,
        tokensOutput: null,
        tokensCacheRead: null,
        tokensCacheWrite: null,
        createdAt: now,
      };

      const result = toAgentRun(row as any);
      expect(result.status).toBe('running');
      expect(result.prepareLeaseExpiresAt).toBe(lease);
    });
  });

  describe('toObservedAgentRun (G2-4 统一投影)', () => {
    const baseRow = {
      id: 'run-obs-1',
      kind: 'issue' as const,
      issueId: 'iss-1',
      chatThreadId: null,
      projectId: null,
      agentId: 'agt-1',
      failureReason: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
      waitingLocalEnteredAt: null,
      prepareLeaseExpiresAt: null,
      isLeader: 0,
      squadId: null,
      rerunOfRunId: null,
      quickPrompt: null,
      runtime: 'claude-code' as const,
      cwdMode: 'project_local' as const,
      cwdPath: '/repo',
      tokensInput: null,
      tokensOutput: null,
      tokensCacheRead: null,
      tokensCacheWrite: null,
    };

    it('queued run carries queue ages / backoff block / no terminal reason', () => {
      const now = Date.now();
      const row = {
        ...baseRow,
        status: 'queued' as const,
        createdAt: now - 30_000,
        nextAttemptAt: now + 10_000,
      };
      const result = toObservedAgentRun(row as any, now);
      expect(result.queueAgeMs).toBe(30_000);
      expect(result.queueEligibleAt).toBe(row.nextAttemptAt);
      expect(result.queueBlockedReason).toBe('retry_backoff');
      expect(result.heartbeatAgeMs).toBeNull();
      expect(result.terminalReason).toBeNull();
    });

    it('terminal run carries terminalReason and null dynamic ages', () => {
      const now = Date.now();
      const row = {
        ...baseRow,
        status: 'completed' as const,
        createdAt: now - 60_000,
        nextAttemptAt: null,
      };
      const result = toObservedAgentRun(row as any, now);
      expect(result.terminalReason).toBe('completed');
      expect(result.queueAgeMs).toBeNull();
      expect(result.heartbeatAgeMs).toBeNull();
      expect(result.id).toBe('run-obs-1'); // 仍含全部基础字段
    });

    it('failed run with failureReason projects it as terminalReason', () => {
      const now = Date.now();
      const row = {
        ...baseRow,
        status: 'failed' as const,
        failureReason: 'provider_network' as const,
        createdAt: now - 5_000,
      };
      const result = toObservedAgentRun(row as any, now);
      expect(result.terminalReason).toBe('provider_network');
    });
  });
});
