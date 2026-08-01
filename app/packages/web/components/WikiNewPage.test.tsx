import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * WikiNewPage（/wiki/new）测试
 * - ?title= / ?issueId= / ?projectId= 预填
 * - 空标题 / 空正文禁用提交
 * - 成功后 router.push('/wiki?slug=…')
 */

const push = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/wiki/new',
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

const createMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useProjects: () => ({
    data: [
      { id: 'proj-a', title: '平台 A' },
      { id: 'proj-b', title: '平台 B' },
    ],
  }),
  useCreateWikiPage: () => ({
    mutate: createMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { WikiNewPage } from './WikiNewPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WikiNewPage />
    </QueryClientProvider>,
  );
}

describe('WikiNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
  });

  it('从 ?title= 预填标题，?issueId= 预置回链正文', () => {
    mockSearchParams = new URLSearchParams({
      title: '修复登录态过期',
      issueId: 'iss_1',
    });
    renderPage();

    expect(screen.getByTestId('wiki-new-title')).toHaveValue('修复登录态过期');
    expect(screen.getByTestId('wiki-new-content').textContent).toContain(
      '/issues/iss_1',
    );
    expect(screen.getByTestId('wiki-new-page')).toBeTruthy();
  });

  it('空标题 / 空正文禁用提交，不调用 mutate', () => {
    mockSearchParams = new URLSearchParams({ title: '有标题但无正文' });
    renderPage();
    const submit = screen.getByTestId('wiki-new-submit');
    expect(submit).toBeDisabled();

    // 用户清空标题 → 仍禁用
    fireEvent.change(screen.getByTestId('wiki-new-title'), {
      target: { value: '   ' },
    });
    expect(submit).toBeDisabled();

    fireEvent.click(submit);
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('填齐标题与正文后可提交，成功后跳转 /wiki?slug=…', () => {
    createMutate.mockImplementation((input: { title: string }, opts?: any) => {
      opts?.onSuccess?.({ slug: 'login-fix', title: input.title });
    });
    mockSearchParams = new URLSearchParams({ title: '修复登录态过期' });
    renderPage();

    const submit = screen.getByTestId('wiki-new-submit');
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('wiki-new-content'), {
      target: { value: '# 现象\n## 根因' },
    });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toEqual({
      title: '修复登录态过期',
      content: '# 现象\n## 根因',
    });
    expect(push).toHaveBeenCalledWith('/wiki?slug=login-fix');
  });

  it('?projectId= 预选项目根，成功后跳转带 projectId', () => {
    createMutate.mockImplementation((input: { title: string }, opts?: any) => {
      opts?.onSuccess?.({ slug: 'perf-note', title: input.title });
    });
    mockSearchParams = new URLSearchParams({ projectId: 'proj-b' });
    renderPage();

    expect(screen.getByTestId('wiki-new-project')).toHaveValue('proj-b');
    expect(screen.getByTestId('wiki-new-project-hint')).toHaveTextContent('平台 B');

    fireEvent.change(screen.getByTestId('wiki-new-title'), {
      target: { value: '性能笔记' },
    });
    fireEvent.change(screen.getByTestId('wiki-new-content'), {
      target: { value: '正文' },
    });
    fireEvent.click(screen.getByTestId('wiki-new-submit'));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0].title).toBe('性能笔记');
    expect(push).toHaveBeenCalledWith('/wiki?slug=perf-note&projectId=proj-b');
  });
});
