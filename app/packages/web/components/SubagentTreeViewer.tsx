'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { RunTreeNode } from '@ma/shared';
import { useRunTree } from '@/lib/api';

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

function formatTokens(input?: number | null, output?: number | null): string {
  const total = (input || 0) + (output || 0);
  if (total === 0) return '—';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tokens`;
  return `${total} tokens`;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-blue-100 text-blue-800 border-blue-300 animate-pulse';
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'queued':
    case 'waiting_local_directory':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'cancelled':
      return 'bg-gray-100 text-gray-700 border-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

function getStatusZh(status: string): string {
  switch (status) {
    case 'running':
      return '执行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'queued':
      return '排队中';
    case 'waiting_local_directory':
      return '等待目录锁';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

// Recurse to collect tree statistics
function collectTreeStats(node: RunTreeNode): {
  totalCount: number;
  subagentCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  totalTokens: number;
  maxDurationMs: number;
} {
  let subagentCount = 0;
  let runningCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let totalTokens = 0;
  let maxDurationMs = 0;

  function traverse(n: RunTreeNode, isRoot: boolean) {
    if (!isRoot) {
      subagentCount += 1;
      if (n.status === 'running') runningCount += 1;
      else if (n.status === 'completed') completedCount += 1;
      else if (n.status === 'failed') failedCount += 1;

      totalTokens += (n.tokensInput || 0) + (n.tokensOutput || 0);
      if (n.durationMs && n.durationMs > maxDurationMs) {
        maxDurationMs = n.durationMs;
      }
    }
    for (const child of n.children) {
      traverse(child, false);
    }
  }

  traverse(node, true);
  return {
    totalCount: subagentCount,
    subagentCount,
    runningCount,
    completedCount,
    failedCount,
    totalTokens,
    maxDurationMs,
  };
}

export function SubagentTreeViewer({
  runId,
  onSelectRun,
}: {
  runId: string;
  onSelectRun?: (selectedRunId: string) => void;
}) {
  const { data: tree, isLoading, isError } = useRunTree(runId, {
    refetchIntervalMs: 3000,
  });

  const [viewMode, setViewMode] = useState<'tree' | 'flow'>('tree');
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});

  const stats = useMemo(() => (tree ? collectTreeStats(tree) : null), [tree]);

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSummary = (id: string) => {
    setExpandedSummaries((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 animate-pulse">
        加载子代理委派链路树…
      </div>
    );
  }

  if (isError || !tree) {
    return null; // Return null if no tree or error
  }

  const subagents = tree.children;
  if (subagents.length === 0) {
    return null; // No subagents delegated for this run
  }

  return (
    <div
      className="subagent-tree-viewer my-4 border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden"
      data-testid="subagent-tree-viewer"
    >
      {/* Header & Stats Bar */}
      <div className="subagent-tree-header px-4 py-3 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              子代理委派链路 (Subagent Delegation Tree)
              <span className="text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                {stats?.subagentCount || 0} 个子任务
              </span>
            </h3>
            <p className="text-xs text-gray-500">
              层次化展示派生的 Agent 执行状态、耗时、Token 与父侧摘要产出
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Quick Stats */}
        <div className="flex items-center space-x-3">
          {stats && (
            <div
              className="subagent-tree-stats flex items-center space-x-2 text-xs text-gray-600 bg-white px-3 py-1 rounded-md border border-gray-200"
              data-testid="subagent-tree-stats"
            >
              {stats.runningCount > 0 && (
                <span className="text-blue-600 font-medium">{stats.runningCount} 执行中</span>
              )}
              {stats.completedCount > 0 && (
                <span className="text-green-600">{stats.completedCount} 完成</span>
              )}
              {stats.failedCount > 0 && (
                <span className="text-red-600">{stats.failedCount} 失败</span>
              )}
              {stats.totalTokens > 0 && (
                <span className="text-gray-400">| {formatTokens(stats.totalTokens)}</span>
              )}
            </div>
          )}

          <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              data-testid="view-toggle-tree"
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                viewMode === 'tree'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              树状层级
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flow')}
              data-testid="view-toggle-flow"
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                viewMode === 'flow'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              委派链路图
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 overflow-x-auto">
        {viewMode === 'tree' ? (
          <div className="subagent-tree-content space-y-3">
            {subagents.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                depth={0}
                collapsedNodes={collapsedNodes}
                expandedSummaries={expandedSummaries}
                onToggleCollapse={toggleCollapse}
                onToggleSummary={toggleSummary}
                onSelectRun={onSelectRun}
              />
            ))}
          </div>
        ) : (
          <FlowDiagramView
            rootNode={tree}
            onSelectRun={onSelectRun}
            expandedSummaries={expandedSummaries}
            onToggleSummary={toggleSummary}
          />
        )}
      </div>
    </div>
  );
}

// Tree Node Item Component
function TreeNodeItem({
  node,
  depth,
  collapsedNodes,
  expandedSummaries,
  onToggleCollapse,
  onToggleSummary,
  onSelectRun,
}: {
  node: RunTreeNode;
  depth: number;
  collapsedNodes: Record<string, boolean>;
  expandedSummaries: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onToggleSummary: (id: string) => void;
  onSelectRun?: (id: string) => void;
}) {
  const isCollapsed = Boolean(collapsedNodes[node.id]);
  const isSummaryExpanded = Boolean(expandedSummaries[node.id]);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div
      className="tree-node-item relative"
      style={{ marginLeft: `${depth * 24}px` }}
      data-testid={`subagent-node-${node.id}`}
    >
      {/* Indentation Line for Nested Nodes */}
      {depth > 0 && (
        <div className="absolute -left-4 top-0 bottom-0 w-px bg-gray-200 border-l border-dashed border-gray-300" />
      )}

      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 hover:bg-slate-50 transition-all shadow-2xs">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            {/* Collapse/Expand Toggle */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggleCollapse(node.id)}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:bg-gray-200 text-xs font-bold"
                aria-label={isCollapsed ? '展开' : '折叠'}
              >
                {isCollapsed ? '+' : '−'}
              </button>
            ) : (
              <span className="w-5 text-center text-gray-300 font-mono text-xs">•</span>
            )}

            {/* Agent Role & Name */}
            <span className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
              {node.agentName || 'Subagent'}
              {node.agentRole && (
                <span className="text-2xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-normal">
                  {node.agentRole}
                </span>
              )}
              {node.isLeader && (
                <span className="text-2xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                  Leader
                </span>
              )}
            </span>

            {/* Status Badge */}
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getStatusBadgeClass(
                node.status
              )}`}
            >
              {getStatusZh(node.status)}
            </span>
          </div>

          {/* Metrics & Terminal Button */}
          <div className="flex items-center space-x-3 text-xs text-gray-500">
            <span>耗时: {formatDuration(node.durationMs)}</span>
            {(node.tokensInput || node.tokensOutput) ? (
              <span>Token: {formatTokens(node.tokensInput, node.tokensOutput)}</span>
            ) : null}

            {onSelectRun ? (
              <button
                type="button"
                onClick={() => onSelectRun(node.id)}
                data-testid={`subagent-terminal-link-${node.id}`}
                className="px-2 py-1 bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-600 text-gray-700 rounded text-xs transition-colors flex items-center gap-1"
              >
                <span>终端</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            ) : (
              <Link
                href={`/runs/${node.id}`}
                data-testid={`subagent-terminal-link-${node.id}`}
                className="px-2 py-1 bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-600 text-gray-700 rounded text-xs transition-colors flex items-center gap-1"
              >
                <span>终端</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* Prompt Preview */}
        {node.quickPrompt && (
          <div className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border border-gray-100 font-mono truncate">
            <span className="text-gray-400 font-sans mr-1">Prompt:</span>
            {node.quickPrompt}
          </div>
        )}

        {/* Father-Side Collected Summary Accordion */}
        {node.summary && (
          <div className="mt-2 text-xs">
            <button
              type="button"
              onClick={() => onToggleSummary(node.id)}
              data-testid={`subagent-summary-toggle-${node.id}`}
              className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 focus:outline-none"
            >
              <span>{isSummaryExpanded ? '收起父侧摘要' : '查看父侧摘要/产出'}</span>
              <svg
                className={`w-3 h-3 transform transition-transform ${
                  isSummaryExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isSummaryExpanded && (
              <div
                className="mt-1.5 p-2.5 bg-slate-900 text-slate-100 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-60 border border-slate-800"
                data-testid={`subagent-summary-${node.id}`}
              >
                {node.summary}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Render Child Subagents recursively if not collapsed */}
      {hasChildren && !isCollapsed && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedNodes={collapsedNodes}
              expandedSummaries={expandedSummaries}
              onToggleCollapse={onToggleCollapse}
              onToggleSummary={onToggleSummary}
              onSelectRun={onSelectRun}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Flow Diagram View Component
function FlowDiagramView({
  rootNode,
  onSelectRun,
  expandedSummaries,
  onToggleSummary,
}: {
  rootNode: RunTreeNode;
  onSelectRun?: (id: string) => void;
  expandedSummaries: Record<string, boolean>;
  onToggleSummary: (id: string) => void;
}) {
  return (
    <div className="subagent-flow-diagram p-4 bg-slate-50 border border-gray-200 rounded-lg overflow-x-auto">
      <div className="min-w-max flex items-start space-x-6">
        {/* Parent Node */}
        <div className="flex flex-col items-center">
          <div className="p-3 bg-blue-600 text-white rounded-lg shadow-md w-48 text-center">
            <span className="text-2xs uppercase tracking-wider text-blue-200 block font-semibold">
              Root Run
            </span>
            <span className="font-bold text-sm block truncate">{shortId(rootNode.id)}</span>
            <span className={`inline-block mt-1 px-2 py-0.5 text-2xs rounded-full bg-blue-700 text-white border border-blue-500`}>
              {rootNode.agentName || 'Parent'}
            </span>
          </div>

          <div className="w-0.5 h-6 bg-blue-400 my-1" />
          <div className="w-full border-t-2 border-blue-400" />
        </div>
      </div>

      {/* Subagent Level 1 Nodes */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rootNode.children.map((sub) => (
          <FlowCard
            key={sub.id}
            node={sub}
            onSelectRun={onSelectRun}
            isExpanded={Boolean(expandedSummaries[sub.id])}
            onToggleSummary={onToggleSummary}
          />
        ))}
      </div>
    </div>
  );
}

function FlowCard({
  node,
  onSelectRun,
  isExpanded,
  onToggleSummary,
}: {
  node: RunTreeNode;
  onSelectRun?: (id: string) => void;
  isExpanded: boolean;
  onToggleSummary: (id: string) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xs flex flex-col justify-between space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-gray-800 truncate">
          {node.agentName || 'Subagent'}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusBadgeClass(node.status)}`}>
          {getStatusZh(node.status)}
        </span>
      </div>

      {node.quickPrompt && (
        <p className="text-xs text-gray-500 line-clamp-2 italic font-mono bg-gray-50 p-1.5 rounded">
          "{node.quickPrompt}"
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
        <span>{formatDuration(node.durationMs)}</span>
        <span>{formatTokens(node.tokensInput, node.tokensOutput)}</span>

        {onSelectRun ? (
          <button
            type="button"
            onClick={() => onSelectRun(node.id)}
            className="text-blue-600 hover:underline font-medium"
          >
            进入终端 →
          </button>
        ) : (
          <Link href={`/runs/${node.id}`} className="text-blue-600 hover:underline font-medium">
            进入终端 →
          </Link>
        )}
      </div>

      {node.summary && (
        <div className="mt-1 pt-1 border-t border-gray-100">
          <button
            type="button"
            onClick={() => onToggleSummary(node.id)}
            className="text-xs text-blue-600 hover:underline font-medium"
          >
            {isExpanded ? '隐藏产出摘要' : '显示产出摘要'}
          </button>
          {isExpanded && (
            <div className="mt-1 p-2 bg-slate-900 text-slate-100 text-xs rounded font-mono max-h-40 overflow-y-auto">
              {node.summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
