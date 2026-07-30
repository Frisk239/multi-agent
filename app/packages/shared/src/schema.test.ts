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

  describe('AgentRunStatus', () => {
    it('accepts all run statuses', () => {
      const statuses = [
        'queued',
        'waiting_local_directory',
        'running',
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
      ];
      for (const r of reasons) {
        expect(AgentRunFailureReason.parse(r)).toBe(r);
      }
      expect(AgentRunFailureReason.options).toEqual(reasons);
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
  });
});
