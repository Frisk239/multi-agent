import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * CreateSkillDialog 焦点陷阱测试（W3）
 * 照 KeyboardShortcutsModal 的 useFocusTrap 用法验证：
 * 初始聚焦进弹层 / Tab 循环 / Esc 关闭 / 关闭后焦点归还。
 */

vi.mock('@/lib/api', () => ({
  useScanLocalSkills: () => ({ isPending: false }),
  useImportLocalSkills: () => ({ isPending: false }),
  useImportSkillFromUrl: () => ({ isPending: false }),
  useProjects: () => ({ data: [] }),
}));

import { CreateSkillDialog } from './CreateSkillDialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="open-trigger" onClick={() => setOpen(true)}>
        打开
      </button>
      <CreateSkillDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function focusableInside(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled'));
}

describe('CreateSkillDialog 焦点陷阱', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('打开后初始焦点进入弹层内部', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('open-trigger'));
    const dialog = screen.getByTestId('create-skill-dialog');
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Tab 循环：最后一个元素后回到第一个', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('open-trigger'));
    const dialog = screen.getByTestId('create-skill-dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    const nodes = focusableInside(dialog);
    expect(nodes.length).toBeGreaterThan(1);

    nodes[nodes.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(nodes[0]);
  });

  it('Shift+Tab 循环：第一个元素后回到最后一个', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('open-trigger'));
    const dialog = screen.getByTestId('create-skill-dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    const nodes = focusableInside(dialog);

    nodes[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(nodes[nodes.length - 1]);
  });

  it('Esc 关闭弹层', async () => {
    const onClose = vi.fn();
    render(<CreateSkillDialog open onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('create-skill-dialog')).toBeTruthy();
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('关闭后焦点归还到打开前元素', async () => {
    render(<Harness />);
    const trigger = screen.getByTestId('open-trigger');
    // jsdom 的 click 不会移动焦点，先手动聚焦模拟真实浏览器行为
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId('create-skill-dialog').contains(document.activeElement)).toBe(true);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('create-skill-dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });
});
