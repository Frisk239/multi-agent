import { describe, expect, it } from 'vitest';
import type { IssueStatus } from '@ma/shared';
import {
  buildChildDoneCommentBody,
  decideChildDonePropagation,
  isTerminalIssueStatus,
  type ChildSnapshot,
} from './child-done-propagation.js';

const child = (id: string, status: IssueStatus): ChildSnapshot => ({ id, status });
const staged = (id: string, status: IssueStatus, stage: number): ChildSnapshot => ({
  id,
  status,
  stage,
});

describe('isTerminalIssueStatus', () => {
  it('done / cancelled 是 terminal，其余不是', () => {
    expect(isTerminalIssueStatus('done')).toBe(true);
    expect(isTerminalIssueStatus('cancelled')).toBe(true);
    for (const s of ['backlog', 'todo', 'in_progress', 'in_review', 'blocked']) {
      expect(isTerminalIssueStatus(s)).toBe(false);
    }
    expect(isTerminalIssueStatus(null)).toBe(false);
    expect(isTerminalIssueStatus(undefined)).toBe(false);
  });
});

describe('decideChildDonePropagation', () => {
  it('最后一个子任务收口 → 传播', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'in_progress',
      nextStatus: 'done',
      parentStatus: 'in_progress',
      siblings: [child('c1', 'done'), child('c2', 'done')],
    });
    expect(d.propagate).toBe(true);
    expect(d.reason).toBe('ok');
  });

  it('cancelled 也算收口', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'todo',
      nextStatus: 'cancelled',
      parentStatus: 'todo',
      siblings: [child('c1', 'cancelled')],
    });
    expect(d.propagate).toBe(true);
  });

  it('还有兄弟未收口 → 不传播', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'in_progress',
      nextStatus: 'done',
      parentStatus: 'in_progress',
      siblings: [child('c1', 'done'), child('c2', 'in_progress')],
    });
    expect(d.propagate).toBe(false);
    expect(d.reason).toBe('siblings_pending');
  });

  it('无父级 → 不传播', () => {
    for (const parentId of [null, undefined, '']) {
      const d = decideChildDonePropagation({
        parentId,
        prevStatus: 'todo',
        nextStatus: 'done',
        parentStatus: 'todo',
        siblings: [],
      });
      expect(d.propagate).toBe(false);
      expect(d.reason).toBe('no_parent');
    }
  });

  // 仅 non-terminal→terminal：这条防止 done→cancelled 之类再通知一次
  it('terminal 之间移动 → 不传播', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'done',
      nextStatus: 'cancelled',
      parentStatus: 'in_progress',
      siblings: [child('c1', 'cancelled')],
    });
    expect(d.propagate).toBe(false);
    expect(d.reason).toBe('not_a_transition');
  });

  it('目标不是 terminal → 不传播', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'todo',
      nextStatus: 'in_progress',
      parentStatus: 'todo',
      siblings: [child('c1', 'in_progress')],
    });
    expect(d.propagate).toBe(false);
    expect(d.reason).toBe('next_not_terminal');
  });

  it('父已收口 → 不再打扰', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'in_progress',
      nextStatus: 'done',
      parentStatus: 'done',
      siblings: [child('c1', 'done')],
    });
    expect(d.propagate).toBe(false);
    expect(d.reason).toBe('parent_already_terminal');
  });

  it('单子任务场景也成立', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'in_review',
      nextStatus: 'done',
      parentStatus: 'in_progress',
      siblings: [child('only', 'done')],
    });
    expect(d.propagate).toBe(true);
  });

  // —— W7 阶段屏障 ——

  it('staged 子：同 stage 兄弟未全终态 → 不传播（stage_siblings_pending）', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'in_progress',
      nextStatus: 'done',
      parentStatus: 'in_progress',
      stage: 1,
      siblings: [
        staged('c1', 'done', 1),
        staged('c2', 'in_progress', 1), // 同 stage 还开着
        staged('c3', 'in_progress', 2), // 其他 stage 不参与判断
        child('c4', 'in_progress'), // unstaged 不阻塞 stage 推进
      ],
    });
    expect(d.propagate).toBe(false);
    expect(d.reason).toBe('stage_siblings_pending');
  });

  it('staged 子：同 stage 全终态即传播（其他 stage / unstaged 不阻塞）', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'in_progress',
      nextStatus: 'done',
      parentStatus: 'in_progress',
      stage: 1,
      siblings: [
        staged('c1', 'done', 1),
        staged('c2', 'done', 1),
        staged('c3', 'todo', 2), // stage 2 未动
        child('c4', 'todo'), // unstaged 未动
      ],
    });
    expect(d.propagate).toBe(true);
    expect(d.reason).toBe('ok');
  });

  it('unstaged 子：仍走全收口语义（含 staged 兄弟未完成 → 不传播）', () => {
    const d = decideChildDonePropagation({
      parentId: 'p1',
      prevStatus: 'in_progress',
      nextStatus: 'done',
      parentStatus: 'in_progress',
      stage: null,
      siblings: [child('c1', 'done'), staged('c2', 'in_progress', 1)],
    });
    expect(d.propagate).toBe(false);
    expect(d.reason).toBe('siblings_pending');
  });
});

describe('buildChildDoneCommentBody', () => {
  it('带指派人时给出 mention 链接，并声明未改父状态', () => {
    const body = buildChildDoneCommentBody({
      childCount: 3,
      lastChildIdentifier: 'FRI-12',
      lastChildTitle: '补充回归测试',
      assigneeMention: '[@后端小助手](mention://agent/ag-1)',
    });
    expect(body).toContain('子任务已全部收口');
    expect(body).toContain('共 3 个直接子任务');
    expect(body).toContain('FRI-12');
    expect(body).toContain('补充回归测试');
    expect(body).toContain('mention://agent/ag-1');
    expect(body).toContain('父状态未自动修改');
  });

  it('未指派时说明需人工决定，且不编造 mention', () => {
    const body = buildChildDoneCommentBody({
      childCount: 1,
      lastChildIdentifier: 'FRI-9',
      lastChildTitle: null,
      assigneeMention: null,
    });
    expect(body).toContain('父任务未指派');
    expect(body).not.toContain('mention://');
    expect(body).toContain('父状态未自动修改');
  });

  it('缺少最后子任务信息时不输出空占位行', () => {
    const body = buildChildDoneCommentBody({
      childCount: 2,
      lastChildIdentifier: null,
      lastChildTitle: null,
      assigneeMention: null,
    });
    expect(body).not.toContain('最后收口');
  });
});
