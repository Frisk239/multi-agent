import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { confirmDialog, useConfirmStore } from '@/lib/confirm-store';

describe('ConfirmDialog', () => {
  afterEach(() => {
    cleanup();
    const s = useConfirmStore.getState();
    if (s.pending) s.settle(false);
  });

  it('renders nothing when idle', () => {
    render(<ConfirmDialog />);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('shows title/description and confirms', async () => {
    render(<ConfirmDialog />);
    const p = confirmDialog({
      title: '批量删除',
      description: '确定要删除选中的 3 项吗？',
      confirmLabel: '删除',
      variant: 'danger',
    });

    expect(await screen.findByTestId('confirm-dialog')).toBeTruthy();
    expect(screen.getByTestId('confirm-dialog-title').textContent).toContain(
      '批量删除',
    );
    expect(
      screen.getByTestId('confirm-dialog-description').textContent,
    ).toContain('确定要删除选中的 3 项吗？');
    expect(screen.getByTestId('confirm-dialog').getAttribute('data-variant')).toBe(
      'danger',
    );

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await expect(p).resolves.toBe(true);
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
  });

  it('cancel and Esc settle false', async () => {
    render(<ConfirmDialog />);
    const p1 = confirmDialog({ title: '清除指派？' });
    fireEvent.click(await screen.findByTestId('confirm-dialog-cancel'));
    await expect(p1).resolves.toBe(false);

    const p2 = confirmDialog({ title: 'Esc 关' });
    await screen.findByTestId('confirm-dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(p2).resolves.toBe(false);
  });

  it('hideCancel omits cancel button', async () => {
    render(<ConfirmDialog />);
    void confirmDialog({
      title: '无法指派',
      description: 'cwd 未配置',
      hideCancel: true,
      confirmLabel: '知道了',
    });
    await screen.findByTestId('confirm-dialog');
    expect(screen.queryByTestId('confirm-dialog-cancel')).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
  });

  // Slice 56 · 迁移后仍用同一 API：危险删除 / 信息闸 / 派活 dirty 文案
  it('danger delete path cancels without side effects', async () => {
    render(<ConfirmDialog />);
    const p = confirmDialog({
      title: '删除记忆？',
      description: '删除这条记忆？不可恢复。',
      confirmLabel: '删除',
      variant: 'danger',
    });
    const dlg = await screen.findByTestId('confirm-dialog');
    expect(dlg.getAttribute('data-variant')).toBe('danger');
    expect(screen.getByTestId('confirm-dialog-title').textContent).toContain(
      '删除记忆',
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await expect(p).resolves.toBe(false);
  });

  it('info gate (hideCancel) for hard-block assignee', async () => {
    render(<ConfirmDialog />);
    const p = confirmDialog({
      title: '无法开工',
      description: 'Agent X 当前不可开工（cwd_missing）。请先修复环境/运行时。',
      confirmLabel: '知道了',
      hideCancel: true,
    });
    await screen.findByTestId('confirm-dialog');
    expect(screen.queryByTestId('confirm-dialog-cancel')).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await expect(p).resolves.toBe(true);
  });

  it('git dirty dispatch confirm uses danger variant', async () => {
    render(<ConfirmDialog />);
    const p = confirmDialog({
      title: '工作区有未提交修改',
      description:
        '本地代码仓库存在未提交修改（3 个文件），派发 Agent 可能会修改/覆写相关代码。是否继续？',
      confirmLabel: '仍要派发',
      variant: 'danger',
    });
    const dlg = await screen.findByTestId('confirm-dialog');
    expect(dlg.getAttribute('data-variant')).toBe('danger');
    expect(screen.getByTestId('confirm-dialog-confirm').textContent).toContain(
      '仍要派发',
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await expect(p).resolves.toBe(true);
  });
});
