import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentBuilderWizard } from './AgentBuilderWizard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const push = vi.fn();
const createMutate = vi.fn();
const createFromTemplateMutate = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  useCreateAgent: () => ({
    mutate: createMutate,
    isPending: false,
  }),
  useCreateAgentFromTemplate: () => ({
    mutate: createFromTemplateMutate,
    isPending: false,
  }),
  useAgentTemplates: () => ({
    data: [
      {
        id: 'fullstack',
        title: '全栈研发',
        summary: '前后端一体',
        name: '全栈研发',
        category: '研发',
        runtime: 'opencode',
        model: null,
        thinkingLevel: null,
        concurrency: 2,
        instructions: '你是资深全栈工程师。',
        allowedPaths: null,
        mcpServers: null,
        icon: '💻',
      },
      {
        id: 'reviewer',
        title: '代码审查',
        summary: '审查代码',
        name: '代码审查官',
        category: '审查',
        runtime: 'claude-code',
        model: null,
        thinkingLevel: null,
        concurrency: 2,
        instructions: '你是代码审查官。',
        allowedPaths: null,
        mcpServers: null,
        icon: '👀',
      },
      {
        id: 'docs',
        title: '文档撰写',
        summary: '写文档',
        name: '文档撰写',
        category: '文档',
        runtime: 'cursor',
        model: null,
        thinkingLevel: null,
        concurrency: 1,
        instructions: '你是文档作者。',
        allowedPaths: null,
        mcpServers: null,
        icon: '📝',
      },
      {
        id: 'bug_triage',
        title: 'Bug 分诊',
        summary: '分诊',
        name: 'Bug 分诊',
        category: '质量',
        runtime: 'claude-code',
        model: null,
        thinkingLevel: null,
        concurrency: 2,
        instructions: '分诊缺陷。',
        allowedPaths: null,
        mcpServers: null,
        icon: '🐞',
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useRuntimeModels: () => ({
    data: { models: [] },
    isFetching: false,
  }),
  useRuntimes: () => ({
    data: {
      runtimes: [
        { id: 'claude-code', supportsThinkingLevel: true },
        { id: 'opencode', supportsThinkingLevel: true },
        { id: 'cursor', supportsThinkingLevel: true },
        { id: 'grok', supportsThinkingLevel: true },
        { id: 'pi', supportsThinkingLevel: false },
      ],
    },
  }),
}));

describe('AgentBuilderWizard', () => {
  const renderComponent = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <AgentBuilderWizard onCancel={() => {}} />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    push.mockReset();
    createMutate.mockReset();
    createFromTemplateMutate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders step 0 and template gallery', () => {
    renderComponent();
    expect(screen.getByTestId('agent-builder-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('builder-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('template-blank')).toBeInTheDocument();
    expect(screen.getByTestId('template-fullstack')).toBeInTheDocument();
    expect(screen.getByTestId('agent-template-gallery')).toBeInTheDocument();
  });

  it('navigates to step 1 on blank template', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-blank'));
    expect(screen.getByTestId('builder-step-1')).toBeInTheDocument();
  });

  it('navigates to step 1 and pre-fills on template click', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-fullstack'));
    expect(screen.getByTestId('builder-step-1')).toBeInTheDocument();
    const input = screen.getByTestId('builder-name-input') as HTMLInputElement;
    expect(input.value).toBe('全栈研发');
  });

  it('can navigate through all steps and create from template', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-fullstack'));

    // Step 1
    fireEvent.click(screen.getByText('下一步'));

    // Step 2
    expect(screen.getByTestId('builder-step-2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('下一步'));

    // Step 3
    expect(screen.getByTestId('builder-step-3')).toBeInTheDocument();
    fireEvent.click(screen.getByText('下一步'));

    // Step 4
    expect(screen.getByTestId('builder-step-4')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('builder-submit'));

    expect(createFromTemplateMutate).toHaveBeenCalledTimes(1);
    const arg = createFromTemplateMutate.mock.calls[0][0];
    expect(arg.templateId).toBe('fullstack');
    expect(arg.overrides.name).toBe('全栈研发');
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('opencode 显示 thinking 编辑器；pi 隐藏并提交 thinkingLevel=null', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-blank'));
    fireEvent.change(screen.getByTestId('builder-name-input'), {
      target: { value: 'Pi 助手' },
    });
    fireEvent.click(screen.getByText('下一步'));

    expect(screen.getByTestId('builder-thinking-select')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('builder-runtime-select'), {
      target: { value: 'pi' },
    });
    expect(screen.queryByTestId('builder-thinking-select')).toBeNull();
    expect(screen.getByTestId('builder-thinking-unavailable')).toHaveTextContent(
      '此 runtime 不消费 Thinking/Effort',
    );

    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByTestId('builder-submit'));
    expect(createMutate.mock.calls[0][0].runtime).toBe('pi');
    expect(createMutate.mock.calls[0][0].thinkingLevel).toBeNull();
  });

  it('blank path uses ordinary create agent', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-blank'));
    const nameInput = screen.getByTestId('builder-name-input');
    fireEvent.change(nameInput, { target: { value: '测试智能体' } });
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByTestId('builder-submit'));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createFromTemplateMutate).not.toHaveBeenCalled();
    expect(createMutate.mock.calls[0][0].name).toBe('测试智能体');
  });
});
