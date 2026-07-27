import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Slice 62 · ChatPage threads/messages 诚实 ErrorState + empty CTA
 */

const push = vi.fn();
const replace = vi.fn();
const refetchThreads = vi.fn();
const refetchMessages = vi.fn();
let mockSearchParams = new URLSearchParams();

let threadsState = {
  data: [] as unknown[],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: refetchThreads,
};

let messagesState = {
  data: [] as unknown[],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: refetchMessages,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/chat',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/confirm-store', () => ({
  confirmDialog: vi.fn(async () => true),
}));

vi.mock('@/lib/draft-storage', () => ({
  draftKey: { chat: (id: string) => `chat:${id}` },
  usePersistentDraft: () => ({
    value: '',
    setValue: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('@/lib/ws', () => ({
  useRunProgressStore: (
    sel: (s: {
      byRunId: Record<string, string>;
      toolByRunId: Record<string, string>;
      partialByRunId: Record<string, string>;
    }) => unknown,
  ) => sel({ byRunId: {}, toolByRunId: {}, partialByRunId: {} }),
}));

vi.mock('./MarkdownBody', () => ({
  MarkdownBody: ({ source }: { source: string }) => <div>{source}</div>,
}));

vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./Select', () => ({
  Select: ({
    children,
    ...rest
  }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...rest}>{children}</select>
  ),
}));

vi.mock('@/lib/api', () => ({
  API: 'http://test',
  apiFetch: vi.fn(),
  useAgents: () => ({ data: [{ id: 'ag-1', name: 'Bot', runtime: 'x', model: 'm' }] }),
  useProjects: () => ({ data: [] }),
  useChatThreads: () => threadsState,
  useChatMessages: () => messagesState,
  useChatExecContext: () => ({ data: undefined }),
  useCreateChatThread: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePostChatMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  usePinChatThread: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveChatThread: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateChatThreadProject: () => ({ mutate: vi.fn(), isPending: false }),
  useWorkspaceRuns: () => ({ data: [] }),
  useRunMessages: () => ({ data: [] }),
}));

import { ChatPage } from './ChatPage';

function renderChat() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPage />
    </QueryClientProvider>,
  );
}

describe('ChatPage ErrorState / EmptyState (Slice 62)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    threadsState = {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchThreads,
    };
    messagesState = {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMessages,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders threads ErrorState with retry when useChatThreads isError', () => {
    threadsState = {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('会话 API 挂了'),
      refetch: refetchThreads,
    };
    renderChat();

    expect(screen.getByTestId('chat-threads-error')).toBeTruthy();
    expect(screen.getByTestId('chat-main-error')).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('加载会话失败').length).toBeGreaterThan(0);
    expect(screen.getAllByText('会话 API 挂了').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: '重试' })[0]!);
    expect(refetchThreads).toHaveBeenCalled();
  });

  it('renders skeleton while threads loading', () => {
    threadsState = {
      data: [],
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchThreads,
    };
    renderChat();
    expect(screen.getByTestId('chat-threads-loading')).toBeTruthy();
    expect(screen.queryByTestId('chat-threads-error')).toBeNull();
  });

  it('renders empty rail EmptyState with new-thread CTA', () => {
    renderChat();
    expect(screen.getByTestId('chat-threads-empty')).toBeTruthy();
    expect(screen.getByText('还没有对话')).toBeTruthy();
    expect(screen.getByTestId('chat-empty-new')).toBeTruthy();
    expect(screen.getByTestId('chat-empty')).toBeTruthy();
    expect(screen.getByTestId('chat-empty-cta')).toBeTruthy();
  });

  it('renders messages ErrorState when thread selected and messages fail', () => {
    mockSearchParams = new URLSearchParams('thread=th-1');
    threadsState = {
      data: [
        {
          id: 'th-1',
          title: '会话一',
          agentId: 'ag-1',
          projectId: null,
          pinnedAt: null,
          lastMessagePreview: null,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchThreads,
    };
    messagesState = {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('消息拉取失败'),
      refetch: refetchMessages,
    };
    renderChat();

    expect(screen.getByTestId('chat-messages-error')).toBeTruthy();
    expect(screen.getByText('加载消息失败')).toBeTruthy();
    expect(screen.getByText('消息拉取失败')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(refetchMessages).toHaveBeenCalledTimes(1);
  });
});
