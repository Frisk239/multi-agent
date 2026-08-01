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
  useLabels: () => ({ data: mockLabels }),
  useSettingsStatus: () => ({ data: undefined }),
  useAgentsReadinessMap: () => ({ data: {} }),
}));

let mockLabels: Array<{ id: string; name: string; color: string }> = [];

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
    mockLabels = [];
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

  // —— F2：状态 + 标签 ——

  it('渲染状态 Select（默认 todo）与标签多选区', () => {
    mockLabels = [{ id: 'lab-1', name: '后端', color: '#3b82f6' }];
    renderForm();
    openForm();
    const status = screen.getByTestId('new-issue-status') as HTMLSelectElement;
    expect(status).toBeTruthy();
    expect(status.value).toBe('todo');
    expect(screen.getByTestId('new-issue-labels')).toBeTruthy();
    expect(screen.getByTestId('new-issue-label-lab-1')).toBeTruthy();
  });

  it('提交体携带 status 与 labels（多选标签）', () => {
    mockLabels = [
      { id: 'lab-1', name: '后端', color: '#3b82f6' },
      { id: 'lab-2', name: 'UI', color: '#8b5cf6' },
    ];
    renderForm();
    openForm();
    fireEvent.change(screen.getByTestId('new-issue-title'), {
      target: { value: '带标签建卡' },
    });
    fireEvent.change(screen.getByTestId('new-issue-status'), {
      target: { value: 'in_progress' },
    });
    fireEvent.click(screen.getByTestId('new-issue-label-lab-1'));
    fireEvent.click(screen.getByTestId('new-issue-label-lab-2'));
    fireEvent.click(screen.getByTestId('new-issue-label-lab-2')); // 取消选中
    fireEvent.submit(screen.getByTestId('new-issue-title').closest('form')!);

    expect(createMutate).toHaveBeenCalledTimes(1);
    const input = createMutate.mock.calls[0][0];
    expect(input.status).toBe('in_progress');
    expect(input.labels).toEqual(['lab-1']);
  });

  it('quickCreate 打开表单并预填该列 status', () => {
    mockLabels = [];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <NewIssueForm quickCreate={null} />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('new-issue-form')).toBeNull();
    rerender(
      <QueryClientProvider client={queryClient}>
        <NewIssueForm quickCreate={{ status: 'done', nonce: 1 }} />
      </QueryClientProvider>,
    );
    const form = screen.getByTestId('new-issue-form');
    expect(form).toBeTruthy();
    expect((screen.getByTestId('new-issue-status') as HTMLSelectElement).value).toBe(
      'done',
    );
  });
});
