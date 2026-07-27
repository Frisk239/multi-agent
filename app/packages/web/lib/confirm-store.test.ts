import { afterEach, describe, expect, it } from 'vitest';
import { confirmDialog, useConfirmStore } from './confirm-store';

describe('confirm-store', () => {
  afterEach(() => {
    const s = useConfirmStore.getState();
    if (s.pending) s.settle(false);
  });

  it('request sets pending and settle(true) resolves true', async () => {
    const p = confirmDialog({
      title: '删除？',
      description: '不可恢复',
      variant: 'danger',
    });
    const pending = useConfirmStore.getState().pending;
    expect(pending?.title).toBe('删除？');
    expect(pending?.description).toBe('不可恢复');
    expect(pending?.variant).toBe('danger');
    useConfirmStore.getState().settle(true);
    await expect(p).resolves.toBe(true);
    expect(useConfirmStore.getState().pending).toBeNull();
  });

  it('settle(false) resolves false', async () => {
    const p = confirmDialog({ title: '取消吗' });
    useConfirmStore.getState().settle(false);
    await expect(p).resolves.toBe(false);
  });

  it('stacked request rejects previous with false', async () => {
    const first = confirmDialog({ title: 'first' });
    const second = confirmDialog({ title: 'second' });
    expect(useConfirmStore.getState().pending?.title).toBe('second');
    await expect(first).resolves.toBe(false);
    useConfirmStore.getState().settle(true);
    await expect(second).resolves.toBe(true);
  });

  it('defaults labels and variant', () => {
    void confirmDialog({ title: 'x' });
    const p = useConfirmStore.getState().pending;
    expect(p?.confirmLabel).toBe('确认');
    expect(p?.cancelLabel).toBe('取消');
    expect(p?.variant).toBe('default');
    expect(p?.hideCancel).toBe(false);
    useConfirmStore.getState().settle(false);
  });
});
