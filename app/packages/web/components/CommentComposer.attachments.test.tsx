import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * W1 · CommentComposer 真实附件上传
 * 选文件 → chip；chip 可删；提交带 attachmentIds；超限本地拦截。
 */

const uploadMutateAsync = vi.fn();
const createMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useAgents: () => ({ data: [] }),
  useSquads: () => ({ data: [] }),
  useCreateComment: () => ({
    mutate: createMutate,
    isPending: false,
    isError: false,
  }),
  useUploadAttachment: () => ({
    mutateAsync: uploadMutateAsync,
    isPending: false,
  }),
}));

vi.mock('./MarkdownBody', () => ({
  MarkdownBody: ({ source }: { source: string }) => <div>{source}</div>,
}));

import { CommentComposer } from './CommentComposer';
import { MAX_UPLOAD_BYTES } from '@/lib/attachment-upload';

function meta(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'att-1',
    issueId: 'iss-1',
    commentId: null,
    originalName: '报告.pdf',
    mime: 'application/pdf',
    sizeBytes: 2048,
    downloadUrl: '/api/attachments/att-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function pdfFile(name = '报告.pdf', bytes = 'hello') {
  return new File([bytes], name, { type: 'application/pdf' });
}

/** jsdom 里 File.size 由内容决定；超限用例需要伪造 size */
function hugeFile(name = 'big.mp4') {
  const f = new File(['x'], name, { type: 'video/mp4' });
  Object.defineProperty(f, 'size', { value: MAX_UPLOAD_BYTES + 1 });
  return f;
}

async function pick(files: File[]) {
  const input = screen.getByTestId('composer-attach-input');
  fireEvent.change(input, { target: { files } });
}

describe('CommentComposer 附件（W1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    uploadMutateAsync.mockResolvedValue(meta());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('选文件后真实上传并出现可见 chip（名字 + 体积）', async () => {
    render(<CommentComposer issueId="iss-1" />);
    expect(screen.queryByTestId('composer-attachment-chip')).toBeNull();

    await pick([pdfFile()]);

    await waitFor(() => {
      expect(screen.getByTestId('composer-attachment-chip')).toBeTruthy();
    });
    const chip = screen.getByTestId('composer-attachment-chip');
    expect(chip).toHaveAttribute('data-attachment-id', 'att-1');
    expect(chip.textContent).toContain('报告.pdf');
    expect(chip.textContent).toContain('2 KiB');

    // 走的是真实上传 hook，不是 data URL 内嵌
    expect(uploadMutateAsync).toHaveBeenCalledTimes(1);
    expect(uploadMutateAsync.mock.calls[0][0]).toBeInstanceOf(File);
    expect(screen.queryByTestId('comment-attach-error')).toBeNull();
  });

  it('📎 按钮点击会打开受控 file input（非 document.createElement）', async () => {
    render(<CommentComposer issueId="iss-1" />);
    const input = screen.getByTestId('composer-attach-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByTestId('composer-tool-attach'));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(input.multiple).toBe(true);
  });

  it('chip 可删（移除后不再随评论提交）', async () => {
    render(<CommentComposer issueId="iss-1" />);
    await pick([pdfFile()]);
    await waitFor(() => screen.getByTestId('composer-attachment-chip'));

    fireEvent.click(screen.getByTestId('composer-attachment-chip-remove'));
    await waitFor(() => {
      expect(screen.queryByTestId('composer-attachment-chip')).toBeNull();
    });

    fireEvent.change(screen.getByTestId('comment-composer-textarea'), {
      target: { value: '正文' },
    });
    fireEvent.click(screen.getByTestId('comment-submit-btn'));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toEqual({ body: '正文' });
  });

  it('提交时带上 attachmentIds，成功后清空 pending', async () => {
    render(<CommentComposer issueId="iss-1" />);
    uploadMutateAsync.mockResolvedValueOnce(meta({ id: 'att-1' }));
    uploadMutateAsync.mockResolvedValueOnce(
      meta({ id: 'att-2', originalName: 'b.txt', sizeBytes: 10 }),
    );
    await pick([pdfFile(), pdfFile('b.txt')]);
    await waitFor(() => {
      expect(screen.getAllByTestId('composer-attachment-chip')).toHaveLength(2);
    });

    fireEvent.change(screen.getByTestId('comment-composer-textarea'), {
      target: { value: '带附件的评论' },
    });
    fireEvent.click(screen.getByTestId('comment-submit-btn'));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toEqual({
      body: '带附件的评论',
      attachmentIds: ['att-1', 'att-2'],
    });

    // 触发 mutate 的 onSuccess → 清空 chip
    const opts = createMutate.mock.calls[0][1] as { onSuccess: () => void };
    opts.onSuccess();
    await waitFor(() => {
      expect(screen.queryByTestId('composer-attachment-chip')).toBeNull();
    });
  });

  it('超过 25 MiB 本地就拦下，不发请求，并给 role=alert 文案', async () => {
    render(<CommentComposer issueId="iss-1" />);
    await pick([hugeFile()]);

    await waitFor(() => {
      expect(screen.getByTestId('comment-attach-error')).toBeTruthy();
    });
    expect(screen.getByTestId('comment-attach-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('comment-attach-error').textContent).toContain('25 MiB');
    expect(uploadMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('composer-attachment-chip')).toBeNull();
  });

  it('拖拽：dragover 给视觉态，drop 触发上传', async () => {
    render(<CommentComposer issueId="iss-1" />);
    const card = screen.getByTestId('comment-composer');
    expect(card).toHaveAttribute('data-dragging', '0');

    fireEvent.dragOver(card, { dataTransfer: { types: ['Files'], files: [] } });
    expect(card).toHaveAttribute('data-dragging', '1');

    fireEvent.dragLeave(card, { dataTransfer: { types: ['Files'], files: [] } });
    expect(card).toHaveAttribute('data-dragging', '0');

    fireEvent.dragOver(card, { dataTransfer: { types: ['Files'], files: [] } });
    fireEvent.drop(card, { dataTransfer: { types: ['Files'], files: [pdfFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId('composer-attachment-chip')).toBeTruthy();
    });
    expect(card).toHaveAttribute('data-dragging', '0');
    expect(uploadMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('上传失败：小图回退内嵌 data URL 并提示', async () => {
    uploadMutateAsync.mockRejectedValueOnce(new Error('服务端 500'));
    render(<CommentComposer issueId="iss-1" />);

    const png = new File(['tiny-bytes'], 'shot.png', { type: 'image/png' });
    await pick([png]);

    await waitFor(() => {
      expect(screen.getByTestId('comment-attach-error').textContent).toContain(
        '上传失败',
      );
    });
    // 回退成功时会把 markdown 追加进正文
    await waitFor(() => {
      const ta = screen.getByTestId('comment-composer-textarea') as HTMLTextAreaElement;
      expect(ta.value).toContain('![shot.png](data:image/png;base64,');
    });
    expect(screen.queryByTestId('composer-attachment-chip')).toBeNull();
  });
});
