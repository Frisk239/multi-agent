import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  confirmDialog: vi.fn(async () => true),
  updateTitleMutateAsync: vi.fn(),
  deleteThreadMutate: vi.fn(),
}));
const {
  replace,
  confirmDialog,
  updateTitleMutateAsync,
  deleteThreadMutate,
} = mocks;
let mockSearchParams = new URLSearchParams();

let threadsState = {
  data: [] as any[],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => '/chat',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/lib/confirm-store', () => ({ confirmDialog: mocks.confirmDialog }));

vi.mock('@/lib/draft-storage', () => ({
  draftKey: { chat: (id: string) => `chat:${id}` },
  usePersistentDraft: () => ({ value: '', setValue: vi.fn(), clear: vi.fn() }),
}));

vi.mock('@/lib/ws', () => ({
  useRunProgressStore: (selector: (state: any) => unknown) =>
    selector({ byRunId: {}, toolByRunId: {}, partialByRunId: {} }),
}));

vi.mock('./MarkdownBody', () => ({
  MarkdownBody: ({ source }: { source: string }) => <div>{source}</div>,
}));

vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./Select', () => ({
  Select: ({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...rest}>{children}</select>
  ),
}));

vi.mock('@/lib/api', () => ({
  API: 'http://test',
  apiFetch: vi.fn(),
  useAgents: () => ({ data: [{ id: 'ag-1', name: 'Bot', runtime: 'x', model: 'm' }] }),
  useProjects: () => ({ data: [] }),
  useChatThreads: () => threadsState,
  useChatMessages: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useChatExecContext: () => ({ data: undefined }),
  useCreateChatThread: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePostChatMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  usePinChatThread: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveChatThread: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateChatThread: () => ({ mutateAsync: mocks.updateTitleMutateAsync, isPending: false }),
  useDeleteChatThread: () => ({ mutate: mocks.deleteThreadMutate, isPending: false }),
  useUpdateChatThreadProject: () => ({ mutate: vi.fn(), isPending: false }),
  useWorkspaceRuns: () => ({ data: [] }),
  useRunMessages: () => ({ data: [] }),
}));

import { ChatPage } from './ChatPage';

const selectedThread = {
  id: 'th-1',
  title: '初始标题',
  agentId: 'ag-1',
  projectId: null,
  pinnedAt: null,
  archivedAt: null,
  lastMessagePreview: null,
};

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPage />
    </QueryClientProvider>,
  );
}

describe('ChatPage title and archived hard delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('thread=th-1');
    threadsState = {
      data: [{ ...selectedThread }],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    updateTitleMutateAsync.mockResolvedValue({ ...selectedThread, title: '新标题' });
    deleteThreadMutate.mockImplementation((_id: string, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
  });

  afterEach(() => cleanup());

  it('submits a trimmed inline title on Enter and blur, while Escape abandons the draft', async () => {
    const view = renderChat();

    fireEvent.click(screen.getByTestId('chat-title-edit'));
    const input = screen.getByTestId('chat-title-input');
    fireEvent.change(input, { target: { value: '  新标题  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(updateTitleMutateAsync).toHaveBeenCalledWith({ id: 'th-1', title: '新标题' });
    });
    await waitFor(() => expect(screen.queryByTestId('chat-title-input')).toBeNull());

    threadsState = { ...threadsState, data: [{ ...selectedThread, title: '新标题' }] };
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ChatPage />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('chat-title-edit').textContent).toBe('新标题');

    fireEvent.click(screen.getByTestId('chat-title-edit'));
    fireEvent.change(screen.getByTestId('chat-title-input'), { target: { value: '放弃的草稿' } });
    fireEvent.keyDown(screen.getByTestId('chat-title-input'), { key: 'Escape' });
    expect(updateTitleMutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chat-title-edit').textContent).toBe('新标题');

    fireEvent.click(screen.getByTestId('chat-title-edit'));
    fireEvent.change(screen.getByTestId('chat-title-input'), { target: { value: '模糊提交' } });
    fireEvent.blur(screen.getByTestId('chat-title-input'));
    await waitFor(() => {
      expect(updateTitleMutateAsync).toHaveBeenLastCalledWith({ id: 'th-1', title: '模糊提交' });
    });
  });

  it('only exposes hard delete in archived scope and clears the selected thread after success', async () => {
    renderChat();
    expect(screen.queryByTestId('chat-thread-delete')).toBeNull();

    fireEvent.click(screen.getByTestId('chat-scope-archived'));
    const deleteButton = await screen.findByTestId('chat-thread-delete');
    fireEvent.click(deleteButton);

    await waitFor(() => expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: '永久删除会话？',
      confirmLabel: '永久删除',
      variant: 'danger',
    })));
    await waitFor(() => expect(deleteThreadMutate).toHaveBeenCalledWith(
      'th-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    ));
    expect(replace).toHaveBeenCalledWith('/chat', { scroll: false });
  });

  it('does not clear the selected thread when deletion is rejected', async () => {
    deleteThreadMutate.mockImplementation((_id: string, options?: { onError?: (error: Error) => void }) => {
      options?.onError?.(new Error('为保留运行记录，无法删除'));
    });
    renderChat();
    fireEvent.click(screen.getByTestId('chat-scope-archived'));
    fireEvent.click(await screen.findByTestId('chat-thread-delete'));

    await waitFor(() => expect(deleteThreadMutate).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-main-title')).toBeTruthy();
  });
});
