import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { Issue } from '@ma/shared';
import { IssueCustomFields } from './IssueCustomFields';

const updateMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useUpdateIssue: () => ({ mutate: updateMutate, isPending: false }),
}));

function makeIssue(customFields: Record<string, string> | null): Issue {
  return {
    id: 'iss-cf-1',
    workspaceId: 'ws-1',
    identifier: 'CF-1',
    title: '自定义字段测试',
    description: '',
    status: 'todo',
    priority: 'none',
    assignee: null,
    creatorType: 'user',
    creatorId: 'u-1',
    position: 0,
    labels: [],
    customFields,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  } as Issue;
}

describe('G3-6 issue custom fields editor', () => {
  beforeEach(() => {
    updateMutate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('回读已有自定义字段（key: value 展示）', () => {
    render(<IssueCustomFields issue={makeIssue({ 环境: '生产', 模块: '支付' })} />);
    expect(screen.getByTestId('custom-field-item-环境')).toBeTruthy();
    expect(screen.getByTestId('custom-field-value-环境')).toHaveTextContent('生产');
    expect(screen.getByTestId('custom-field-value-模块')).toHaveTextContent('支付');
  });

  it('添加字段：输入 key/value → 提交 customFields 合并', () => {
    render(<IssueCustomFields issue={makeIssue({ 环境: '生产' })} />);
    fireEvent.click(screen.getByTestId('add-custom-field'));
    const keyInput = screen.getByTestId('custom-field-input-key');
    const valInput = screen.getByTestId('custom-field-input-value');
    fireEvent.change(keyInput, { target: { value: '版本' } });
    fireEvent.change(valInput, { target: { value: 'v2.1' } });
    fireEvent.click(screen.getByTestId('save-custom-field'));
    expect(updateMutate.mock.calls[0][0]).toEqual({
      id: 'iss-cf-1',
      input: { customFields: { 环境: '生产', 版本: 'v2.1' } },
    });
  });

  it('内联编辑已有字段：点值 → 改 → 保存提交新值', () => {
    render(<IssueCustomFields issue={makeIssue({ 环境: '生产' })} />);
    fireEvent.click(screen.getByTestId('custom-field-value-环境'));
    const input = screen.getByTestId('inline-edit-input-环境');
    fireEvent.change(input, { target: { value: '预发' } });
    fireEvent.click(screen.getByTestId('save-inline-edit-环境'));
    expect(updateMutate.mock.calls[0][0]).toEqual({
      id: 'iss-cf-1',
      input: { customFields: { 环境: '预发' } },
    });
  });

  it('删除字段：提交不含该 key 的 customFields', () => {
    render(<IssueCustomFields issue={makeIssue({ 环境: '生产', 模块: '支付' })} />);
    fireEvent.click(screen.getByTestId('delete-custom-field-环境'));
    expect(updateMutate.mock.calls[0][0]).toEqual({
      id: 'iss-cf-1',
      input: { customFields: { 模块: '支付' } },
    });
  });

  it('空字段列表：不渲染字段列表，仅显示添加入口', () => {
    render(<IssueCustomFields issue={makeIssue(null)} />);
    expect(screen.queryByTestId(/^custom-field-item-/)).toBeNull();
    expect(screen.getByTestId('add-custom-field')).toBeTruthy();
  });
});
