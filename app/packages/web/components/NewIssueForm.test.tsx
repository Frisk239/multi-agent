import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NewIssueForm 组件测试（W3 表单校验）
 * - 无效输入 → FieldError（role=alert）+ aria-invalid + aria-describedby
 * - 有效输入 → create.mutate 收到 CreateIssueInput 校验后的数据
 * Mock next/navigation + @/lib/api hooks
 */

const push = vi.fn();
const replace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => mockSearchParams,
}));

const createMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useCreateIssue: () => ({ mutate: createMutate, isPending: false }),
  useAgents: () => ({ data: [] }),
  useSquads: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
  useSettingsStatus: () => ({ data: undefined }),
  useAgentsReadinessMap: () => ({ data: {} }),
}));

import { NewIssueForm } from './NewIssueForm';

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewIssueForm />
    </QueryClientProvider>,
  );
}

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: '新建 Issue' }));
}

describe('NewIssueForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('点击按钮展开表单', () => {
    renderForm();
    openForm();
    expect(screen.getByTestId('new-issue-form')).toBeTruthy();
  });

  it('空标题提交：出现 FieldError（role=alert）+ aria-invalid + aria-describedby，不调用 mutate', () => {
    renderForm();
    openForm();
    const title = screen.getByTestId('new-issue-title');
    fireEvent.submit(title.closest('form')!);

    // 错误行以 alert 语义渲染，且与输入框联动
    const err = screen.getByRole('alert');
    expect(err.textContent).toBeTruthy();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAttribute('aria-describedby', 'new-issue-title-error');
    expect(screen.getByTestId('new-issue-title-error')).toHaveTextContent(
      err.textContent!,
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('修正标题后错误消失', () => {
    renderForm();
    openForm();
    const title = screen.getByTestId('new-issue-title');
    fireEvent.submit(title.closest('form')!);
    expect(title).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(title, { target: { value: '写测试' } });
    expect(title).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('有效输入提交：create.mutate 收到校验后数据', () => {
    renderForm();
    openForm();
    const title = screen.getByTestId('new-issue-title');
    fireEvent.change(title, { target: { value: '写测试' } });
    fireEvent.submit(title.closest('form')!);

    expect(createMutate).toHaveBeenCalledTimes(1);
    const input = createMutate.mock.calls[0][0];
    expect(input.title).toBe('写测试');
    expect(input.priority).toBe('none');
    expect(input.assignee).toBeNull();
  });

  it('纯空白标题也视为无效', () => {
    renderForm();
    openForm();
    const title = screen.getByTestId('new-issue-title');
    fireEvent.change(title, { target: { value: '   ' } });
    fireEvent.submit(title.closest('form')!);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(createMutate).not.toHaveBeenCalled();
  });
});
