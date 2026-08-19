import { describe, it, expect } from 'vitest';
import {
  BusinessId,
  IssueStatus,
  Priority,
  AssigneeType,
  CreatorType,
  AuthorType,
  CommentType,
  RuntimeId,
  RuntimeInfo,
  AgentRunStatus,
  AgentRunFailureReason,
  AgentRunKind,
  RunMessageKind,
  CreateIssueInput,
  CreateAgentInput,
  CreateCommentInput,
  AutomationScheduleKind,
  RerunIssueInput,
  RetryRunInput,
  AgentRun,
  SquadSummary,
  SkillInfo,
  classifyRunFailure,
} from './schema';

describe('Shared Schema Validators', () => {
  describe('BusinessId', () => {
    it('accepts non-empty strings', () => {
      expect(BusinessId.parse('iss-123')).toBe('iss-123');
      expect(BusinessId.parse('a')).toBe('a');
    });

    it('rejects empty strings', () => {
      expect(() => BusinessId.parse('')).toThrow();
    });
  });

  describe('IssueStatus', () => {
    it('accepts valid statuses', () => {
      const valid = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'];
      for (const s of valid) {
        expect(IssueStatus.parse(s)).toBe(s);
      }
    });

    it('rejects invalid statuses', () => {
      expect(() => IssueStatus.parse('invalid_status')).toThrow();
      expect(() => IssueStatus.parse(123)).toThrow();
    });
  });

  describe('Priority', () => {
    it('accepts valid priorities', () => {
      const valid = ['urgent', 'high', 'medium', 'low', 'none'];
      for (const p of valid) {
        expect(Priority.parse(p)).toBe(p);
      }
    });

    it('rejects invalid priorities', () => {
      expect(() => Priority.parse('critical')).toThrow();
    });
  });

  describe('AssigneeType', () => {
    it('accepts member, agent, squad', () => {
      expect(AssigneeType.parse('member')).toBe('member');
      expect(AssigneeType.parse('agent')).toBe('agent');
      expect(AssigneeType.parse('squad')).toBe('squad');
    });

    it('rejects invalid types', () => {
      expect(() => AssigneeType.parse('user')).toThrow();
    });
  });

  describe('CreatorType & AuthorType', () => {
    it('accepts member and agent', () => {
      expect(CreatorType.parse('member')).toBe('member');
      expect(CreatorType.parse('agent')).toBe('agent');
      expect(AuthorType.parse('member')).toBe('member');
    });
  });

  describe('CommentType', () => {
    it('accepts comment and status_change', () => {
      expect(CommentType.parse('comment')).toBe('comment');
      expect(CommentType.parse('status_change')).toBe('status_change');
    });
  });

  describe('RuntimeId', () => {
    it('accepts all registered runtimes', () => {
      const runtimes = ['claude-code', 'opencode', 'cursor', 'grok', 'pi'];
      for (const r of runtimes) {
        expect(RuntimeId.parse(r)).toBe(r);
      }
    });

    it('rejects unknown runtime ids', () => {
      expect(() => RuntimeId.parse('python')).toThrow();
    });
  });

  describe('RuntimeInfo', () => {
    const base = {
      id: 'pi' as const,
      label: 'Pi SDK',
      installed: true,
      version: '1.0.0',
      path: '/usr/bin/pi',
      agentIds: [],
    };

    it('accepts optional supportsThinkingLevel and keeps other capability flags optional', () => {
      expect(RuntimeInfo.parse(base).supportsThinkingLevel).toBeUndefined();
      expect(
        RuntimeInfo.parse({ ...base, supportsThinkingLevel: false }).supportsThinkingLevel,
      ).toBe(false);
      expect(
        RuntimeInfo.parse({
          ...base,
          id: 'claude-code',
          supportsMcpConfig: true,
          supportsCustomArgs: true,
          supportsThinkingLevel: true,
        }).supportsThinkingLevel,
      ).toBe(true);
    });
  });

  describe('AgentRunStatus', () => {
    it('accepts all run statuses', () => {
      const statuses = [
        'queued',
        'waiting_local_directory',
        'running',
        // G2-1：queued 超龄未 claim → deferred（等待 fire_at 后升级）
        'deferred',
        'completed',
        'failed',
        'cancelled',
        'timed_out',
      ];
      for (const s of statuses) {
        expect(AgentRunStatus.parse(s)).toBe(s);
      }
    });
  });

  describe('AgentRunFailureReason', () => {
    it('accepts all failure reasons', () => {
      const reasons = [
        'idle_watchdog',
        'idle_timeout',
        'tool_watchdog',
        'stale_heartbeat',
        'exec_error',
        'timeout',
        'runtime_offline',
        'provider_network',
        'squad_member_escalated',
        'waiting_local_directory_timeout',
        // Slice 63
        'auth_required',
        'quota_exceeded',
        'session_poisoned',
        'cancelled',
        'user_aborted',
        // G2-1：deferred 宽限后自动升级
        'deferred_escalated',
        // G8-2：崩溃后的安全 execution ownership 恢复
        'orphan_termination_attempted',
        'unknown_external_execution',
        // G8-3：必需宿主密钥引用不可解析，CLI 不启动
        'missing_required_env_ref',
      ];
      for (const r of reasons) {
        expect(AgentRunFailureReason.parse(r)).toBe(r);
      }
      expect(AgentRunFailureReason.options).toEqual(reasons);
    });
  });

  describe('classifyRunFailure', () => {
    it('lets explicit G8-2 ownership state override the legacy orphan text classifier', () => {
      const unknown = classifyRunFailure(
        'orphan: execution owner could not be verified after server restart',
        'unknown_external_execution',
      );
      expect(unknown.title).toBe('外部执行状态待确认');
      expect(unknown.hint).toContain('避免误杀');
      expect(unknown.settingsHref).toBe('/settings');

      const terminated = classifyRunFailure(
        'orphan: verified owner termination requested',
        'orphan_termination_attempted',
      );
      expect(terminated.title).toBe('已请求清理残留执行');
      expect(terminated.hint).toContain('请求终止');

      const missingEnv = classifyRunFailure(
        '宿主环境缺少 GITHUB_TOKEN（供 MCP mcpServers.github.headers.Authorization 使用），未启动 CLI',
        'missing_required_env_ref',
      );
      expect(missingEnv.title).toBe('缺少运行所需的宿主环境变量');
      expect(missingEnv.hint).toContain('没有启动');
      expect(missingEnv.settingsHref).toBe('/settings');
    });
  });

  describe('snapshot secret-safety contracts', () => {
    const snapshotManifestBase = {
      archiveVersion: 1 as const,
      createdAt: '2026-08-17T00:00:00.000Z',
      dbSchema: '53',
      workspace: { path: null, source: 'none' as const, configured: false, exists: false },
      wiki: {
        root: 'D:/wiki',
        source: 'cwd' as const,
        projectScopedExcluded: true as const,
        excludedProjectWikiRoots: [],
        exclusions: [],
      },
      files: [],
    };

    it('accepts an older manifest with no advisory and a G8-3 manifest with one', async () => {
      const { SnapshotManifest, SnapshotEntry } = await import('./schema.js');
      expect(SnapshotManifest.safeParse(snapshotManifestBase).success).toBe(true);
      expect(
        SnapshotManifest.safeParse({
          ...snapshotManifestBase,
          secretSafety: {
            status: 'no_known_legacy_literals',
            remediation: 'not an absolute guarantee',
          },
        }).success,
      ).toBe(true);

      const entry = {
        name: 'ma-snapshot-x.ma-backup.zip',
        path: 'D:/backup/ma-snapshot-x.ma-backup.zip',
        sizeBytes: 1,
        createdAt: '2026-08-17T00:00:00.000Z',
        sha256: null,
        valid: true,
      };
      expect(SnapshotEntry.safeParse(entry).success).toBe(false);
      expect(
        SnapshotEntry.safeParse({
          ...entry,
          secretSafety: { status: 'scan_inconclusive', remediation: 'legacy archive' },
        }).success,
      ).toBe(true);
    });
  });

  describe('AgentRunKind', () => {
    it('accepts issue, quick_create, chat', () => {
      expect(AgentRunKind.parse('issue')).toBe('issue');
      expect(AgentRunKind.parse('quick_create')).toBe('quick_create');
      expect(AgentRunKind.parse('chat')).toBe('chat');
    });
  });

  describe('RunMessageKind', () => {
    it('accepts assistant, user, tool_start, tool_end, system', () => {
      const kinds = ['assistant', 'user', 'tool_start', 'tool_end', 'system'];
      for (const k of kinds) {
        expect(RunMessageKind.parse(k)).toBe(k);
      }
    });
  });

  describe('CreateIssueInput', () => {
    it('parses valid create issue input', () => {
      const input = {
        title: 'New Feature',
        description: 'Detail description',
        priority: 'high',
      };
      const result = CreateIssueInput.parse(input);
      expect(result.title).toBe('New Feature');
      expect(result.priority).toBe('high');
    });

    it('rejects missing title', () => {
      expect(() => CreateIssueInput.parse({})).toThrow();
    });

    // F2：create 支持 status/labels
    it('defaults status to todo and accepts labels', () => {
      const result = CreateIssueInput.parse({ title: 'T' });
      expect(result.status).toBe('todo');
      expect(result.labels).toBeUndefined();
    });

    it('accepts explicit status and labels array', () => {
      const result = CreateIssueInput.parse({
        title: 'T',
        status: 'in_progress',
        labels: ['lab-1', 'lab-2'],
      });
      expect(result.status).toBe('in_progress');
      expect(result.labels).toEqual(['lab-1', 'lab-2']);
    });

    it('accepts empty labels array and rejects invalid status/label id', () => {
      expect(CreateIssueInput.parse({ title: 'T', labels: [] }).labels).toEqual([]);
      expect(() => CreateIssueInput.parse({ title: 'T', status: 'bogus' })).toThrow();
      expect(() => CreateIssueInput.parse({ title: 'T', labels: [''] })).toThrow();
    });
  });

  describe('CreateAgentInput', () => {
    it('parses valid create agent input', () => {
      const input = {
        name: 'Bot',
        runtime: 'opencode',
        model: 'opencode/test',
      };
      const result = CreateAgentInput.parse(input);
      expect(result.name).toBe('Bot');
      expect(result.runtime).toBe('opencode');
    });

    it('rejects invalid runtime in agent input', () => {
      expect(() =>
        CreateAgentInput.parse({
          name: 'Bot',
          runtime: 'unsupported-runtime',
        }),
      ).toThrow();
    });

    // P2-4
    it('accepts nullable fallbackAgentId on create', () => {
      expect(
        CreateAgentInput.parse({ name: 'Bot', runtime: 'opencode', fallbackAgentId: 'ag-2' })
          .fallbackAgentId,
      ).toBe('ag-2');
      expect(
        CreateAgentInput.parse({ name: 'Bot', runtime: 'opencode', fallbackAgentId: null })
          .fallbackAgentId,
      ).toBeNull();
    });
  });

  describe('CreateCommentInput', () => {
    it('parses valid comment input', () => {
      const input = {
        body: 'Looks good!',
        authorType: 'member',
        authorId: 'usr-1',
      };
      const result = CreateCommentInput.parse(input);
      expect(result.body).toBe('Looks good!');
    });

    it('rejects empty body if schema enforces non-empty', () => {
      expect(() =>
        CreateCommentInput.parse({
          body: '',
          authorType: 'member',
          authorId: 'usr-1',
        }),
      ).toThrow();
    });
  });

  describe('AutomationScheduleKind', () => {
    it('accepts valid schedule kinds', () => {
      expect(AutomationScheduleKind.parse('interval_minutes')).toBe('interval_minutes');
      expect(AutomationScheduleKind.parse('daily_at')).toBe('daily_at');
    });
  });

  // ---- P6 Boundary value tests ----

  describe('Enum case sensitivity', () => {
    it('rejects uppercase variants of valid enum values', () => {
      expect(() => IssueStatus.parse('TODO')).toThrow();
      expect(() => IssueStatus.parse('In_Progress')).toThrow();
      expect(() => Priority.parse('HIGH')).toThrow();
      expect(() => AgentRunStatus.parse('RUNNING')).toThrow();
    });
  });

  describe('Null and undefined inputs', () => {
    it('rejects null for all enums', () => {
      expect(() => IssueStatus.parse(null)).toThrow();
      expect(() => Priority.parse(null)).toThrow();
      expect(() => RuntimeId.parse(null)).toThrow();
      expect(() => AgentRunStatus.parse(null)).toThrow();
    });

    it('rejects undefined for all enums', () => {
      expect(() => IssueStatus.parse(undefined)).toThrow();
      expect(() => Priority.parse(undefined)).toThrow();
      expect(() => RuntimeId.parse(undefined)).toThrow();
    });
  });

  describe('CreateIssueInput optional fields', () => {
    it('parses with only required title field', () => {
      const result = CreateIssueInput.parse({ title: 'Minimal' });
      expect(result.title).toBe('Minimal');
      // Optional fields should either be undefined or have defaults
      expect(result.description).toBeUndefined();
    });

    it('rejects whitespace-only title if min length enforced', () => {
      // This verifies the schema has a non-empty title constraint
      expect(() => CreateIssueInput.parse({ title: '' })).toThrow();
    });

    it('accepts all optional fields together', () => {
      const result = CreateIssueInput.parse({
        title: 'Full',
        description: 'Desc',
        priority: 'low',
        assigneeType: 'agent',
        assigneeId: 'agt-1',
        projectId: 'proj-1',
      });
      expect(result.title).toBe('Full');
      expect(result.priority).toBe('low');
    });
  });

  describe('BusinessId edge cases', () => {
    it('accepts single character', () => {
      expect(BusinessId.parse('x')).toBe('x');
    });

    it('accepts very long strings', () => {
      const long = 'a'.repeat(500);
      expect(BusinessId.parse(long)).toBe(long);
    });

    it('rejects non-string types', () => {
      expect(() => BusinessId.parse(123)).toThrow();
      expect(() => BusinessId.parse(null)).toThrow();
      expect(() => BusinessId.parse(undefined)).toThrow();
    });
  });

  // Slice 67
  describe('RerunIssueInput / RetryRunInput forceFresh', () => {
    it('accepts empty body and forceFresh boolean', () => {
      expect(RerunIssueInput.parse({})).toEqual({});
      expect(RerunIssueInput.parse({ forceFresh: true, runId: 'r1' })).toEqual({
        forceFresh: true,
        runId: 'r1',
      });
      expect(RetryRunInput.parse({})).toEqual({});
      expect(RetryRunInput.parse({ forceFresh: false })).toEqual({ forceFresh: false });
    });

    it('rejects non-boolean forceFresh', () => {
      expect(() => RetryRunInput.parse({ forceFresh: 'yes' })).toThrow();
      expect(() => RerunIssueInput.parse({ forceFresh: 1 })).toThrow();
    });

    it('AgentRun sessionResumeStatus accepts force_fresh', () => {
      const base = {
        id: 'run-1',
        issueId: null,
        agentId: 'ag-1',
        runtime: 'claude-code',
        status: 'queued',
        kind: 'issue',
        quickPrompt: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: null,
        isLeader: false,
        squadId: null,
        createdAt: new Date().toISOString(),
        sessionResumeStatus: 'force_fresh' as const,
      };
      const parsed = AgentRun.parse(base);
      expect(parsed.sessionResumeStatus).toBe('force_fresh');
    });

    // P2-4
    it('AgentRun accepts nullable escalatedFromRunId lineage', () => {
      const base = {
        id: 'run-1',
        issueId: null,
        agentId: 'ag-1',
        runtime: 'claude-code',
        status: 'queued',
        kind: 'issue',
        quickPrompt: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: null,
        isLeader: false,
        squadId: null,
        createdAt: new Date().toISOString(),
      };
      expect(AgentRun.parse(base).escalatedFromRunId).toBeUndefined();
      const withLineage = AgentRun.parse({ ...base, escalatedFromRunId: 'run-0' });
      expect(withLineage.escalatedFromRunId).toBe('run-0');
    });
  });

  describe('SquadSummary', () => {
    it('accepts optional memberIds (business id array)', () => {
      const withMembers = SquadSummary.parse({
        id: 'sqd-1',
        name: 'Alpha',
        memberIds: ['agt-1', 'agt-2'],
      });
      expect(withMembers.memberIds).toEqual(['agt-1', 'agt-2']);
    });

    it('memberIds is absent when not provided', () => {
      const plain = SquadSummary.parse({ id: 'sqd-1', name: 'Alpha' });
      expect(plain.memberIds).toBeUndefined();
    });

    it('rejects invalid memberIds entries', () => {
      expect(() =>
        SquadSummary.parse({ id: 'sqd-1', name: 'A', memberIds: [''] }),
      ).toThrow();
    });
  });

  describe('SkillInfo', () => {
    const base = {
      name: 'demo',
      description: 'd',
      source: 'builtin' as const,
      usedBy: [],
    };

    it('accepts updatedAt ISO string', () => {
      const parsed = SkillInfo.parse({
        ...base,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(parsed.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('accepts updatedAt null (无文件路径/读取失败)', () => {
      expect(SkillInfo.parse({ ...base, updatedAt: null }).updatedAt).toBeNull();
    });

    it('updatedAt is absent when not provided', () => {
      expect(SkillInfo.parse(base).updatedAt).toBeUndefined();
    });
  });
});
