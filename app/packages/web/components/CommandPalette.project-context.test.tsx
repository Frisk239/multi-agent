import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Project } from '@ma/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommandPalette,
  nextEnabledCommandIndex,
} from './CommandPalette';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setOpen: vi.fn(),
  projects: [] as Project[],
  projectsLoading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/api', () => ({
  useAgents: () => ({ data: [] }),
  useAgentsReadinessMap: () => ({ data: {} }),
  useIssueSearch: () => ({ data: { data: [] }, isFetching: false }),
  useProjects: () => ({ data: mocks.projects, isLoading: mocks.projectsLoading }),
  useRunsActiveCount: () => ({ data: { count: 0 } }),
  useSquads: () => ({ data: [] }),
  useWikiPages: () => ({ data: [] }),
}));

vi.mock('./QuickDispatchPanel', () => ({
  QuickDispatchPanel: () => null,
}));

const project: Project = {
  id: 'project-command-context',
  workspaceId: 'ws-local',
  title: '命令面板项目直达',
  description: '查找项目描述的唯一关键词 cmdk-description-marker',
  status: 'active',
  localPath: 'D:\\code\\cmdk-project-context-marker',
  localPathExists: true,
  issueStats: { total: 0, done: 0 },
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

function renderPalette() {
  return render(<CommandPalette open setOpen={mocks.setOpen} />);
}

function search(value: string) {
  fireEvent.change(screen.getByTestId('cmdk-input'), { target: { value } });
  act(() => {
    vi.advanceTimersByTime(220);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.projects = [];
  mocks.projectsLoading = false;
});

describe('G3-16 CmdK 项目上下文', () => {
  it('title、description 和 localPath 都能命中，项目行展示状态和真实目录', () => {
    vi.useFakeTimers();
    mocks.projects = [project];
    renderPalette();

    for (const query of [
      project.title,
      'cmdk-description-marker',
      'cmdk-project-context-marker',
    ]) {
      search(query);
      const row = screen.getByTestId(`cmdk-item-project-${project.id}`);
      expect(row).toHaveTextContent(project.title);
      expect(row).toHaveTextContent('进行中');
      expect(row).toHaveTextContent(project.localPath!);
      // 仅用 title 作为人类主识别；内部 id 不渲染到可见文本。
      expect(row).not.toHaveTextContent(project.id);
    }
  });

  it('方向键绕开不可执行说明，Enter 进入项目详情', () => {
    vi.useFakeTimers();
    mocks.projects = [project];
    renderPalette();
    search('cmdk-description-marker');

    const input = screen.getByTestId('cmdk-input');
    expect(input).toHaveAttribute('aria-activedescendant', 'cmd-item-0');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'cmd-item-1');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', 'cmd-item-0');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mocks.setOpen).toHaveBeenCalledWith(false);
    expect(mocks.push).toHaveBeenCalledWith(`/projects/${project.id}`);
  });

  it('空查询保留项目列表导航', () => {
    mocks.projects = [project];
    renderPalette();

    fireEvent.click(screen.getByTestId('cmdk-item-nav-projects'));
    expect(mocks.setOpen).toHaveBeenCalledWith(false);
    expect(mocks.push).toHaveBeenCalledWith('/projects');
  });

  it('加载和无项目时不会把假结果当作可执行项目', () => {
    vi.useFakeTimers();
    mocks.projectsLoading = true;
    renderPalette();
    search('cmdk');
    expect(screen.getByTestId('cmdk-item-projects-loading')).toBeDisabled();

    cleanup();
    mocks.projectsLoading = false;
    renderPalette();
    search('cmdk');
    const empty = screen.getByTestId('cmdk-item-projects-empty');
    expect(empty).toHaveTextContent('还没有项目');
    fireEvent.click(empty);
    expect(mocks.push).toHaveBeenCalledWith('/projects');
  });
});

describe('nextEnabledCommandIndex', () => {
  it('跳过加载/空态说明并首尾循环', () => {
    const commands = [{ disabled: true }, {}, { disabled: true }, {}];
    expect(nextEnabledCommandIndex(commands, -1, 1)).toBe(1);
    expect(nextEnabledCommandIndex(commands, 1, 1)).toBe(3);
    expect(nextEnabledCommandIndex(commands, 1, -1)).toBe(3);
    expect(nextEnabledCommandIndex([{ disabled: true }], -1, 1)).toBe(-1);
  });
});
