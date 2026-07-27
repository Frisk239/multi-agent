import { describe, it, expect } from 'vitest';
import { chatThreadHref, qcRetryHref, runRecoveryKind } from './run-recovery';

describe('run-recovery', () => {
  describe('chatThreadHref', () => {
    it('returns formatted chat URL for chat run with chatThreadId', () => {
      const run = { kind: 'chat' as const, chatThreadId: 'th-123' };
      expect(chatThreadHref(run)).toBe('/chat?thread=th-123');
    });

    it('returns null for non-chat run or missing chatThreadId', () => {
      expect(chatThreadHref({ kind: 'issue' as const, chatThreadId: 'th-123' })).toBeNull();
      expect(chatThreadHref({ kind: 'chat' as const, chatThreadId: null })).toBeNull();
    });
  });

  describe('qcRetryHref', () => {
    it('returns query string with quickPrompt', () => {
      const run = { quickPrompt: 'Fix login bug' };
      expect(qcRetryHref(run)).toBe('/?quickPrompt=Fix%20login%20bug');
    });

    it('returns root path when quickPrompt is empty or blank', () => {
      expect(qcRetryHref({ quickPrompt: '' })).toBe('/');
      expect(qcRetryHref({ quickPrompt: '   ' })).toBe('/');
    });
  });

  describe('runRecoveryKind', () => {
    it('returns none for non-terminal runs', () => {
      const run = { kind: 'issue' as const, status: 'running' as const, issueId: 'iss-1', chatThreadId: null };
      expect(runRecoveryKind(run)).toBe('none');
    });

    it('returns open_chat for failed or cancelled chat runs', () => {
      const failedChat = { kind: 'chat' as const, status: 'failed' as const, issueId: null, chatThreadId: 'th-1' };
      expect(runRecoveryKind(failedChat)).toBe('open_chat');

      const cancelledChat = { kind: 'chat' as const, status: 'cancelled' as const, issueId: null, chatThreadId: 'th-1' };
      expect(runRecoveryKind(cancelledChat)).toBe('open_chat');
    });

    it('returns issue_retry for terminal runs associated with an issue', () => {
      const failedIssue = { kind: 'issue' as const, status: 'failed' as const, issueId: 'iss-100', chatThreadId: null };
      expect(runRecoveryKind(failedIssue)).toBe('issue_retry');
    });

    it('returns issue_retry for timed_out issue runs', () => {
      const timedOutIssue = {
        kind: 'issue' as const,
        status: 'timed_out' as const,
        issueId: 'iss-100',
        chatThreadId: null,
      };
      expect(runRecoveryKind(timedOutIssue)).toBe('issue_retry');
    });

    it('returns qc_redispatch for terminal quick_create runs without issueId', () => {
      const failedQC = { kind: 'quick_create' as const, status: 'failed' as const, issueId: null, chatThreadId: null };
      expect(runRecoveryKind(failedQC)).toBe('qc_redispatch');
    });
  });
});
