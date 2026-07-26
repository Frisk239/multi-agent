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
      return 'tree-status-running';
    case 'completed':
      return 'tree-status-completed';
    case 'failed':
      return 'tree-status-failed';
    case 'queued':
    case 'waiting_local_directory':
      return 'tree-status-queued';
    case 'cancelled':
      return 'tree-status-cancelled';
    default:
      return 'tree-status-default';
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
      <div className="subagent-tree-loading">
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
      className="subagent-tree-viewer"
      data-testid="subagent-tree-viewer"
    >
      {/* Header & Stats Bar */}
      <div className="subagent-tree-header">
        <div className="subagent-tree-header-left">
          <div className="subagent-tree-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="subagent-tree-header-title-box">
            <h3>
              子代理委派链路 (Subagent Delegation Tree)
              <span className="subagent-tree-count-badge">
                {stats?.subagentCount || 0} 个子任务
              </span>
            </h3>
            <p className="subagent-tree-header-desc">
              层次化展示派生的 Agent 执行状态、耗时、Token 与父侧摘要产出
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Quick Stats */}
        <div className="subagent-tree-header-right">
          {stats && (
            <div
              className="subagent-tree-stats"
              data-testid="subagent-tree-stats"
            >
              {stats.runningCount > 0 && (
                <span className="subagent-tree-stat-running">{stats.runningCount} 执行中</span>
              )}
              {stats.completedCount > 0 && (
                <span className="subagent-tree-stat-completed">{stats.completedCount} 完成</span>
              )}
              {stats.failedCount > 0 && (
                <span className="subagent-tree-stat-failed">{stats.failedCount} 失败</span>
              )}
              {stats.totalTokens > 0 && (
                <span className="subagent-tree-stat-tokens">| {formatTokens(stats.totalTokens)}</span>
              )}
            </div>
          )}

          <div className="subagent-tree-view-toggle">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              data-testid="view-toggle-tree"
              className={`subagent-tree-toggle-btn ${viewMode === 'tree' ? 'active' : ''}`}
            >
              树状层级
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flow')}
              data-testid="view-toggle-flow"
              className={`subagent-tree-toggle-btn ${viewMode === 'flow' ? 'active' : ''}`}
            >
              委派链路图
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="subagent-tree-body">
        {viewMode === 'tree' ? (
          <div className="subagent-tree-content">
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
      className="tree-node-item"
      style={{ marginLeft: `${depth * 24}px` }}
      data-testid={`subagent-node-${node.id}`}
    >
      {/* Indentation Line for Nested Nodes */}
      {depth > 0 && <div className="tree-node-indent-line" />}

      <div className="tree-node-card">
        {/* Top Header Row */}
        <div className="tree-node-card-header">
          <div className="tree-node-card-meta">
            {/* Collapse/Expand Toggle */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggleCollapse(node.id)}
                className="tree-node-collapse-btn"
                aria-label={isCollapsed ? '展开' : '折叠'}
              >
                {isCollapsed ? '+' : '−'}
              </button>
            ) : (
              <span className="tree-node-dot">•</span>
            )}

            {/* Agent Role & Name */}
            <span className="tree-node-name">
              {node.agentName || 'Subagent'}
              {node.agentRole && (
                <span className="tree-node-role-badge">
                  {node.agentRole}
                </span>
              )}
              {node.isLeader && (
                <span className="tree-node-leader-badge">
                  Leader
                </span>
              )}
            </span>

            {/* Status Badge */}
            <span className={`tree-status-badge ${getStatusBadgeClass(node.status)}`}>
              {getStatusZh(node.status)}
            </span>
          </div>

          {/* Metrics & Terminal Button */}
          <div className="tree-node-card-actions">
            <span>耗时: {formatDuration(node.durationMs)}</span>
            {(node.tokensInput || node.tokensOutput) ? (
              <span>Token: {formatTokens(node.tokensInput, node.tokensOutput)}</span>
            ) : null}

            {onSelectRun ? (
              <button
                type="button"
                onClick={() => onSelectRun(node.id)}
                data-testid={`subagent-terminal-link-${node.id}`}
                className="tree-node-terminal-btn"
              >
                <span>终端</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            ) : (
              <Link
                href={`/runs/${node.id}`}
                data-testid={`subagent-terminal-link-${node.id}`}
                className="tree-node-terminal-btn"
              >
                <span>终端</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* Prompt Preview */}
        {node.quickPrompt && (
          <div className="tree-node-prompt-preview">
            <span>Prompt:</span>
            {node.quickPrompt}
          </div>
        )}

        {/* Father-Side Collected Summary Accordion */}
        {node.summary && (
          <div className="tree-node-summary-wrapper">
            <button
              type="button"
              onClick={() => onToggleSummary(node.id)}
              data-testid={`subagent-summary-toggle-${node.id}`}
              className="tree-node-summary-toggle"
            >
              <span>{isSummaryExpanded ? '收起父侧摘要' : '查看父侧摘要/产出'}</span>
              <svg
                className={`tree-node-summary-arrow ${isSummaryExpanded ? 'expanded' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isSummaryExpanded && (
              <div
                className="tree-summary-terminal"
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
        <div className="tree-node-children">
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
    <div className="subagent-flow-diagram">
      <div className="subagent-flow-root-row">
        {/* Parent Node */}
        <div className="subagent-flow-root-col">
          <div className="subagent-flow-root-card">
            <span className="subagent-flow-root-label">
              Root Run
            </span>
            <span className="subagent-flow-root-id">{shortId(rootNode.id)}</span>
            <span className="subagent-flow-root-badge">
              {rootNode.agentName || 'Parent'}
            </span>
          </div>

          <div className="subagent-flow-line-v" />
          <div className="subagent-flow-line-h" />
        </div>
      </div>

      {/* Subagent Level 1 Nodes */}
      <div className="subagent-flow-grid">
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
    <div className="subagent-flow-card">
      <div className="subagent-flow-card-top">
        <span className="subagent-flow-card-name">
          {node.agentName || 'Subagent'}
        </span>
        <span className={`tree-status-badge ${getStatusBadgeClass(node.status)}`}>
          {getStatusZh(node.status)}
        </span>
      </div>

      {node.quickPrompt && (
        <p className="subagent-flow-card-prompt">
          "{node.quickPrompt}"
        </p>
      )}

      <div className="subagent-flow-card-footer">
        <span>{formatDuration(node.durationMs)}</span>
        <span>{formatTokens(node.tokensInput, node.tokensOutput)}</span>

        {onSelectRun ? (
          <button
            type="button"
            onClick={() => onSelectRun(node.id)}
            className="subagent-flow-link"
          >
            进入终端 →
          </button>
        ) : (
          <Link href={`/runs/${node.id}`} className="subagent-flow-link">
            进入终端 →
          </Link>
        )}
      </div>

      {node.summary && (
        <div className="subagent-flow-card-summary-wrapper">
          <button
            type="button"
            onClick={() => onToggleSummary(node.id)}
            className="subagent-flow-card-summary-toggle"
          >
            {isExpanded ? '隐藏产出摘要' : '显示产出摘要'}
          </button>
          {isExpanded && (
            <div className="subagent-flow-summary-terminal">
              {node.summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
