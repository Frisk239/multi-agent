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
let mockAgents: any[] = [];
let mockReadiness: Record<string, any> = {};

vi.mock('@/lib/api', () => ({
  useCreateIssue: () => ({ mutate: createMutate, isPending: false }),
  useAgents: () => ({ data: mockAgents }),
  useSquads: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
  useLabels: () => ({ data: mockLabels }),
  useSettingsStatus: () => ({ data: undefined }),
  useAgentsReadinessMap: () => ({ data: mockReadiness }),
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
    mockAgents = [];
    mockReadiness = {};
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

  it('已安装但尚未安全预检的 agent 显示黄色警示，仍可提交派活', () => {
    mockAgents = [
      { id: 'agent-unverified', name: '待预检执行者', runtime: 'opencode' },
    ];
    mockReadiness = {
      'agent-unverified': {
        agentId: 'agent-unverified',
        runtime: 'opencode',
        runtimeInstalled: true,
        runtimePath: '/usr/local/bin/opencode',
        runtimeVersion: '1.2.3',
        concurrency: 1,
        runningCount: 0,
        slotsAvailable: 1,
        cwdConfigured: true,
        runtimeVerification: 'unverified',
        status: 'ready',
        detail: null,
      },
    };
    renderForm();
    openForm();

    const select = screen.getByTestId('new-issue-assignee') as HTMLSelectElement;
    expect(select.querySelector('option[value="agent:agent-unverified"]')?.textContent).toContain(
      '未安全预检',
    );
    fireEvent.change(select, { target: { value: 'agent:agent-unverified' } });

    const banner = screen.getByTestId('new-issue-assignee-banner');
    expect(banner).toHaveClass('is-unverified');
    expect(banner).toHaveTextContent('CLI 已安装，尚无安全预检');
    expect(banner).toHaveTextContent('首次运行仍可能失败');
    const submit = screen.getByTestId('new-issue-submit');
    expect(submit).toHaveAttribute('data-assignee-unverified', '1');
    expect(submit).not.toBeDisabled();

    fireEvent.change(screen.getByTestId('new-issue-title'), {
      target: { value: '允许未预检 agent 首次运行' },
    });
    fireEvent.submit(screen.getByTestId('new-issue-title').closest('form')!);
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '允许未预检 agent 首次运行',
        assignee: { type: 'agent', id: 'agent-unverified' },
      }),
      expect.any(Object),
    );
  });

  it('明确 preflight failed 维持既有 error 硬闸，不误称为尚未安全预检', () => {
    mockAgents = [
      { id: 'agent-preflight-failed', name: '预检失败执行者', runtime: 'opencode' },
    ];
    mockReadiness = {
      'agent-preflight-failed': {
        agentId: 'agent-preflight-failed',
        runtime: 'opencode',
        runtimeInstalled: true,
        runtimePath: '/usr/local/bin/opencode',
        runtimeVersion: '1.2.3',
        concurrency: 1,
        runningCount: 0,
        slotsAvailable: 1,
        cwdConfigured: true,
        preflightStatus: 'failed',
        runtimeVerification: 'unverified',
        status: 'error',
        detail: '运行时安全预检未通过：请先在本机 CLI 完成登录，然后重试。',
      },
    };
    renderForm();
    openForm();

    const select = screen.getByTestId('new-issue-assignee') as HTMLSelectElement;
    const failedOption = select.querySelector('option[value="agent:agent-preflight-failed"]');
    expect(failedOption).toBeDisabled();
    expect(failedOption?.textContent).not.toContain('未安全预检');
    // Native UI prevents selecting a disabled option; force the controlled path
    // here to verify a stale/draft selection still renders the real failure.
    fireEvent.change(select, { target: { value: 'agent:agent-preflight-failed' } });

    const banner = screen.getByTestId('new-issue-assignee-banner');
    expect(banner).not.toHaveClass('is-unverified');
    expect(banner).toHaveTextContent('指派方可能无法执行');
    expect(banner).toHaveTextContent('运行时安全预检未通过');
    expect(banner).not.toHaveTextContent('尚无安全预检');
    expect(screen.getByTestId('new-issue-submit')).toHaveAttribute(
      'data-assignee-blocked',
      '1',
    );
    expect(screen.getByTestId('new-issue-submit')).toHaveAttribute(
      'data-assignee-unverified',
      '0',
    );
  });
});
