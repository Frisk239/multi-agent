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
      const runtimes = ['claude-code', 'opencode', 'cursor', 'grok'];
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
      ];
      for (const r of reasons) {
        expect(AgentRunFailureReason.parse(r)).toBe(r);
      }
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
});
