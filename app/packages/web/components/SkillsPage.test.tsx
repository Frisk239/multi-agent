import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * SkillsPage 组件测试（F6-2 / UI-SKL-002）
 * - 列表渲染
 * - 排序 Select 切换写 ?sort=updated（深链可分享）
 * - ?sort=updated 深链直达「最近更新」序（updatedAt desc；字段缺失按 name 兜底）
 * Mock next/navigation + @/lib/api hooks
 */

type MockSkill = {
  name: string;
  description?: string;
  source: 'user' | 'workspace' | 'project' | 'builtin';
  usedBy: Array<{ id: string; name: string; runtime: string }>;
  /** F6-2：列表接口已下发该字段（ISO 或 null）；null 排尾 */
  updatedAt?: string | null;
};

const replace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    // 模拟真实导航：把 URL query 写回 mockSearchParams，组件重渲染后生效
    replace: (url: string, opts?: object) => {
      replace(url, opts);
      const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      mockSearchParams = new URLSearchParams(qs);
    },
  }),
  usePathname: () => '/skills',
  useSearchParams: () => mockSearchParams,
}));

const refreshMutate = vi.fn();
const skillsData: MockSkill[] = [];

vi.mock('@/lib/api', () => ({
  useSkills: () => ({
    data: skillsData,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useRefreshSkills: () => ({
    mutate: refreshMutate,
    isPending: false,
  }),
  useProjects: () => ({ data: [] }),
  useScanLocalSkills: () => ({ mutate: vi.fn() }),
  useImportLocalSkills: () => ({ mutate: vi.fn() }),
  useImportSkillFromUrl: () => ({ mutate: vi.fn() }),
}));

import { SkillsPage } from './SkillsPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SkillsPage />
    </QueryClientProvider>,
  );
  return {
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <SkillsPage />
        </QueryClientProvider>,
      ),
  };
}

function skillNames(): string[] {
  return screen
    .getAllByTestId('skills-list-row')
    .map((el) => el.getAttribute('data-skill-name') ?? '');
}

function pushSkill(name: string, over?: Partial<MockSkill>) {
  skillsData.push({
    name,
    description: `desc-${name}`,
    source: 'user',
    usedBy: [],
    ...over,
  });
}

describe('SkillsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skillsData.length = 0;
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders skills list when skills exist', () => {
    pushSkill('alpha');
    pushSkill('beta');
    renderPage();
    expect(screen.getByTestId('skills-table')).toBeTruthy();
    expect(screen.getAllByTestId('skills-list-row').length).toBe(2);
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByTestId('skills-visible-count')).toHaveTextContent('2');
  });

  it('renders empty state when no skills exist', () => {
    renderPage();
    expect(screen.getByText('还没有 skill')).toBeTruthy();
  });

  it('switching sort select writes ?sort=updated deep link', () => {
    pushSkill('alpha');
    renderPage();
    fireEvent.change(screen.getByTestId('skills-sort-filter'), {
      target: { value: 'updated' },
    });
    expect(replace).toHaveBeenCalledWith('/skills?sort=updated', { scroll: false });
  });

  it('sort=updated orders by updatedAt desc when field is present', () => {
    pushSkill('old-skill', { updatedAt: '2020-01-01T00:00:00.000Z' });
    pushSkill('new-skill', { updatedAt: '2026-01-01T00:00:00.000Z' });
    mockSearchParams = new URLSearchParams('sort=updated');
    renderPage();
    expect(skillNames()).toEqual(['new-skill', 'old-skill']);
  });

  it('sort=updated puts null updatedAt skills last (name asc among tails)', () => {
    pushSkill('alpha-null', { updatedAt: null });
    pushSkill('older', { updatedAt: '2021-01-01T00:00:00.000Z' });
    pushSkill('zeta-null', { updatedAt: null });
    pushSkill('newer', { updatedAt: '2026-01-01T00:00:00.000Z' });
    mockSearchParams = new URLSearchParams('sort=updated');
    renderPage();
    expect(skillNames()).toEqual(['newer', 'older', 'alpha-null', 'zeta-null']);
  });

  it('sort=updated falls back to name order when updatedAt is absent', () => {
    // 列表接口未下发 updatedAt（SkillInfo 无该字段）→ 按 name 兜底
    pushSkill('zeta');
    pushSkill('alpha');
    mockSearchParams = new URLSearchParams('sort=updated');
    renderPage();
    expect(skillNames()).toEqual(['alpha', 'zeta']);
  });

  it('default sort keeps server-provided order', () => {
    pushSkill('zeta');
    pushSkill('alpha');
    renderPage();
    expect(skillNames()).toEqual(['zeta', 'alpha']);
  });
});
