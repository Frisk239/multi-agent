// 生成 KanbanBoard.toolbar.tsx：把 /tmp/toolbar-jsx.txt 的 JSX 包成 KanbanToolbar 组件
const fs = require('fs');
const jsx = fs.readFileSync('scripts/toolbar-jsx.txt', 'utf8').replace(/\n$/, '');

const header = `'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentSummary, SquadSummary, IssueLabel, Project } from '@ma/shared';
import { Select } from './Select';
import { NewIssueForm, type NewIssueQuickCreate } from './NewIssueForm';
import { EmptyState } from './EmptyState';
import type { Density } from '@/lib/density';
import { PRIORITY_OPTIONS, COLUMNS } from './KanbanBoard.shared';

/**
 * O4 拆分：看板工具栏（视图/范围/搜索/筛选/导入导出/活动筛选 chips/空状态）。
 * 原 KanbanBoard.tsx 932-1421 行 JSX 搬移；props = 主组件 state + handlers 显式传入
 * （KanbanBoard 对外导出 props 契约不变）。
 */
export interface KanbanToolbarProps {
  // 范围 / 指派
  selectValue: string;
  setAssigneeFilter: (v: string) => void;
  agents: AgentSummary[];
  squads: SquadSummary[];
  // 搜索
  qDraft: string;
  setQDraft: (v: string) => void;
  qFromUrl: string;
  searchParams: URLSearchParams;
  // 视图 / 排序
  viewMode: 'board' | 'list';
  setViewMode: (v: 'board' | 'list') => void;
  sortMode: 'manual' | 'updated';
  setSortMode: (v: 'manual' | 'updated') => void;
  // 快捷创建
  quickCreate: NewIssueQuickCreate | null;
  // 更多筛选
  showMore: boolean;
  setMoreFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  moreFilterCount: number;
  density: Density;
  setDensity: (d: Density) => void;
  priorityQuery: string | null;
  setPriorityFilter: (v: string) => void;
  originQuery: string | null;
  setOriginFilter: (v: string) => void;
  projectFromUrl: string | null;
  setProjectFilter: (v: string) => void;
  projects: Project[];
  statusQuery: string | null;
  setStatusFilter: (v: string) => void;
  failedOnly: boolean;
  setFailedOnly: (v: boolean) => void;
  failedCount: number;
  visibleCount: number;
  labelFilter: string;
  setLabelFilter: (v: string) => void;
  labels: IssueLabel[] | undefined;
  // 导入导出
  importFileRef: React.RefObject<HTMLInputElement>;
  handleImportFile: (f: File) => void;
  handleExportJson: () => void;
  jsonNotice: string | null;
  // 活动筛选 chips
  assigneeChipLabel: string;
  labelChipName: string;
  priorityChip: string;
  statusChipLabel: string;
  projectChipName: string;
  hasActiveFilters: boolean;
  router: ReturnType<typeof useRouter>;
  pathname: string;
}

export function KanbanToolbar(props: KanbanToolbarProps) {
  const {
    selectValue, setAssigneeFilter, agents, squads,
    qDraft, setQDraft, qFromUrl, searchParams,
    viewMode, setViewMode, sortMode, setSortMode,
    quickCreate, showMore, setMoreFiltersOpen, moreFilterCount,
    density, setDensity, priorityQuery, setPriorityFilter,
    originQuery, setOriginFilter, projectFromUrl, setProjectFilter, projects,
    statusQuery, setStatusFilter, failedOnly, setFailedOnly, failedCount, visibleCount,
    labelFilter, setLabelFilter, labels,
    importFileRef, handleImportFile, handleExportJson, jsonNotice,
    assigneeChipLabel, labelChipName, priorityChip, statusChipLabel, projectChipName,
    hasActiveFilters, router, pathname,
  } = props;

  return (
${jsx}
  );
}
`;

fs.writeFileSync(
  'packages/web/components/KanbanBoard.toolbar.tsx',
  header.replace(/\n$/, '') + '\n',
);
console.log('generated', (header.split('\n').length), 'lines');
