import { describe, it, expect } from 'vitest';
import {
  inboxRunHref,
  isActionableInboxItem,
  resolveInboxPrimaryCta,
} from './inbox-run-cta';

describe('inbox-run-cta', () => {
  describe('resolveInboxPrimaryCta', () => {
    it('failed + runId + issueId → retry 再执行', () => {
      const cta = resolveInboxPrimaryCta({
        kind: 'run_failed',
        type: 'run_failed',
        runId: 'run_1',
        issueId: 'iss_1',
      });
      expect(cta.kind).toBe('retry');
      expect(cta.label).toBe('再执行');
      expect(cta.href).toContain('run_1');
    });

    it('failed + runId + runKind=issue → retry', () => {
      const cta = resolveInboxPrimaryCta({
        kind: 'run_failed',
        runId: 'run_2',
        runKind: 'issue',
      });
      expect(cta.kind).toBe('retry');
      expect(cta.label).toBe('再执行');
    });

    it('failed + runId 无 issue（quick_create）→ open_run 查看运行', () => {
      const cta = resolveInboxPrimaryCta({
        kind: 'run_failed',
        runId: 'run_qc',
        runKind: 'quick_create',
      });
      expect(cta.kind).toBe('open_run');
      expect(cta.label).toBe('查看运行');
      expect(cta.href).toContain('run_qc');
      expect(cta.href).toContain('status=failed');
    });

    it('chat failed → open_chat（优先于 retry）', () => {
      const cta = resolveInboxPrimaryCta({
        kind: 'run_failed',
        runId: 'run_chat',
        issueId: 'iss_x',
        runKind: 'chat',
        chatThreadId: 'th_9',
      });
      expect(cta.kind).toBe('open_chat');
      expect(cta.label).toBe('打开会话');
      expect(cta.href).toBe('/chat?thread=th_9');
    });

    it('title 含聊天失败 → open_chat', () => {
      const cta = resolveInboxPrimaryCta({
        kind: 'run_failed',
        title: '聊天失败',
        runId: 'run_c',
      });
      expect(cta.kind).toBe('open_chat');
      expect(cta.href).toBe('/chat');
    });

    it('waiting_local_directory → open_run', () => {
      const cta = resolveInboxPrimaryCta({
        runId: 'run_w',
        runStatus: 'waiting_local_directory',
      });
      expect(cta.kind).toBe('open_run');
      expect(cta.label).toBe('查看运行');
      expect(cta.href).toContain('run_w');
      expect(cta.href).toContain('waiting_local_directory');
    });

    it('deferred 无 run 有 issue → open_issue', () => {
      const cta = resolveInboxPrimaryCta({
        runStatus: 'deferred',
        issueId: 'iss_d',
      });
      expect(cta.kind).toBe('open_issue');
      expect(cta.href).toBe('/issues/iss_d');
      expect(cta.label).toBe('打开 Issue');
    });

    it('run_completed + runId → open_run', () => {
      const cta = resolveInboxPrimaryCta({
        kind: 'run_completed',
        runId: 'run_ok',
      });
      expect(cta.kind).toBe('open_run');
      expect(cta.label).toBe('查看运行');
      expect(cta.href).toContain('status=completed');
    });

    it('comment + issueId only → open_issue', () => {
      const cta = resolveInboxPrimaryCta({
        kind: 'comment',
        issueId: 'iss_c',
      });
      expect(cta.kind).toBe('open_issue');
      expect(cta.label).toBe('打开 Issue');
    });

    it('empty → none', () => {
      const cta = resolveInboxPrimaryCta({});
      expect(cta.kind).toBe('none');
      expect(cta.label).toBe('');
    });

    it('failed 无 runId 无 issue → open_run 失败列表', () => {
      const cta = resolveInboxPrimaryCta({ kind: 'run_failed' });
      expect(cta.kind).toBe('open_run');
      expect(cta.href).toBe('/runs?status=failed');
    });
  });

  describe('inboxRunHref', () => {
    it('builds failed deep link', () => {
      expect(
        inboxRunHref({ kind: 'run_failed', runId: 'r1' }),
      ).toBe('/runs?run=r1&status=failed');
    });

    it('null without runId for non-fail', () => {
      expect(inboxRunHref({ kind: 'comment' })).toBeNull();
    });
  });

  describe('isActionableInboxItem', () => {
    it('failed is actionable', () => {
      expect(isActionableInboxItem({ kind: 'run_failed' })).toBe(true);
    });

    it('waiting is actionable', () => {
      expect(
        isActionableInboxItem({ runStatus: 'waiting_local_directory' }),
      ).toBe(true);
    });

    it('plain comment not actionable by status alone', () => {
      expect(isActionableInboxItem({ kind: 'comment' })).toBe(false);
    });

    it('severity action_required is actionable', () => {
      expect(
        isActionableInboxItem({ kind: 'assigned', severity: 'action_required' }),
      ).toBe(true);
    });
  });
});
