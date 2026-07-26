'use client';

import React from 'react';
import type { CliDiagnosticItem, CliStatusBadge } from '@ma/shared';
import { useSettingsDiagnostics } from '@/lib/api';
import { Icon } from './Icon';

const STATUS_CONFIG: Record<
  CliStatusBadge,
  { label: string; bg: string; text: string; dot: string }
> = {
  ready: {
    label: 'Ready / 就绪',
    bg: 'rgba(16, 185, 129, 0.12)',
    text: '#10b981',
    dot: '#10b981',
  },
  warning: {
    label: 'Warning / 警告',
    bg: 'rgba(245, 158, 11, 0.12)',
    text: '#f59e0b',
    dot: '#f59e0b',
  },
  not_found: {
    label: 'Not Found / 缺失',
    bg: 'rgba(239, 68, 68, 0.12)',
    text: '#ef4444',
    dot: '#ef4444',
  },
  permission_issue: {
    label: 'Permission Issue / 权限不足',
    bg: 'rgba(139, 92, 246, 0.12)',
    text: '#8b5cf6',
    dot: '#8b5cf6',
  },
};

export function CliHealthInspector() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useSettingsDiagnostics();

  return (
    <section
      className="settings-card cli-health-inspector"
      data-testid="cli-health-inspector"
      aria-label="混合进程与 CLI 环境健康诊断中心"
      style={{ padding: '20px', marginBottom: '24px' }}
    >
      <div
        className="cli-health-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              margin: '0 0 4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Icon name="runtime" size={18} />
            混合进程与 CLI 环境健康诊断中心 (CLI &amp; Process Health Inspector)
          </h3>
          <p
            className="text-dim text-sm"
            style={{ margin: 0, maxWidth: '680px' }}
          >
            实时检测本机 Multi-Backend (Claude Code / Opencode / Cursor / Pi SDK)
            的 CLI 进程路径、版本号、运行支持 (Capabilities) 及工作区 CWD 可读写校验。
          </p>
        </div>

        <button
          type="button"
          className="btn-primary btn-sm"
          data-testid="btn-run-diagnostics"
          onClick={() => void refetch()}
          disabled={isFetching}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isFetching ? 'animate-spin' : ''}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          {isFetching ? '深度检测中…' : '一键深度检测 (Run Diagnostics)'}
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }} className="text-dim text-sm">
          正在探测本机 CLI 环境与进程状态…
        </div>
      ) : isError ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            fontSize: '13px',
          }}
        >
          诊断加载失败: {error instanceof Error ? error.message : '未知错误'}
        </div>
      ) : data ? (
        <>
          {/* Diagnostic Summary Bar */}
          <div
            className="cli-summary-bar text-sm"
            data-testid="cli-summary-bar"
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap',
              padding: '10px 14px',
              background: 'var(--surface-subtle, rgba(255,255,255,0.03))',
              borderRadius: '6px',
              border: '1px solid var(--surface-border, rgba(255,255,255,0.08))',
              marginBottom: '20px',
            }}
          >
            <div>
              <span className="text-dim">已检测 CLI: </span>
              <strong>{data.summary.totalDetected} / {data.cliBackends.length}</strong>
            </div>
            <div style={{ color: '#10b981' }}>
              <span>Ready: </span>
              <strong>{data.summary.readyCount}</strong>
            </div>
            <div style={{ color: '#f59e0b' }}>
              <span>Warning: </span>
              <strong>{data.summary.warningCount}</strong>
            </div>
            <div style={{ color: '#ef4444' }}>
              <span>Not Found: </span>
              <strong>{data.summary.notFoundCount}</strong>
            </div>
            {data.summary.permissionIssueCount > 0 && (
              <div style={{ color: '#8b5cf6' }}>
                <span>Permission Issue: </span>
                <strong>{data.summary.permissionIssueCount}</strong>
              </div>
            )}
            <div style={{ marginLeft: 'auto' }} className="text-dim text-xs">
              最后检测: {new Date(data.timestamp).toLocaleTimeString()}
            </div>
          </div>

          {/* CWD Path Audit Panel */}
          <div
            className="cwd-audit-panel"
            data-testid="cwd-audit-panel"
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: `1px solid ${
                data.cwdAudit.writable && data.cwdAudit.exists
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(245, 158, 11, 0.3)'
              }`,
              background:
                data.cwdAudit.writable && data.cwdAudit.exists
                  ? 'rgba(16, 185, 129, 0.05)'
                  : 'rgba(245, 158, 11, 0.05)',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <strong style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="project" size={16} />
                工作区 CWD 路径及读写校验 (CWD Audit)
              </strong>
              <span
                style={{
                  fontSize: '12px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 500,
                  background:
                    data.cwdAudit.writable && data.cwdAudit.exists
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(245, 158, 11, 0.2)',
                  color:
                    data.cwdAudit.writable && data.cwdAudit.exists
                      ? '#10b981'
                      : '#f59e0b',
                }}
              >
                {data.cwdAudit.writable ? '读写校验通过 (R/W OK)' : '读写警告 / 缺配置'}
              </span>
            </div>
            <p
              className="text-sm"
              data-testid="cwd-audit-message"
              style={{ margin: '0 0 8px', lineHeight: 1.5 }}
            >
              {data.cwdAudit.auditMessage}
            </p>
            <div
              className="text-xs text-dim"
              style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}
            >
              <span>当前生效路径: <code>{data.cwdAudit.path || '—'}</code></span>
              <span>配置来源: <code>{data.cwdAudit.source}</code></span>
              <span>DB持久化: <code>{data.cwdAudit.persistedPath || '未持久化'}</code></span>
            </div>
          </div>

          {/* CLI Backend Cards Grid */}
          <div
            className="cli-cards-grid"
            data-testid="cli-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {data.cliBackends.map((cli) => (
              <CliCard key={cli.id} cli={cli} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function CliCard({ cli }: { cli: CliDiagnosticItem }) {
  const cfg = STATUS_CONFIG[cli.status] || STATUS_CONFIG.not_found;

  return (
    <div
      className={`cli-card cli-card--${cli.id}`}
      data-testid={`cli-card-${cli.id}`}
      style={{
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--surface-border, rgba(255,255,255,0.08))',
        background: 'var(--surface, rgba(255,255,255,0.02))',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Card Header & Status Pulse */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong style={{ fontSize: '15px' }}>{cli.name}</strong>
          <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            [{cli.id}]
          </code>
        </div>

        {/* Live Status Pulse Badge */}
        <div
          className={`status-pulse-badge status-pulse-badge--${cli.status}`}
          data-testid={`status-badge-${cli.status}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 500,
            background: cfg.bg,
            color: cfg.text,
            border: `1px solid ${cfg.text}44`,
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: cfg.dot,
              boxShadow: `0 0 6px ${cfg.dot}`,
            }}
          />
          {cfg.label}
        </div>
      </div>

      {/* Path & Version Info */}
      <div className="text-xs" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="text-dim">Detected Version:</span>
          <strong data-testid="cli-version">{cli.version || '未知 / 未检测到'}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="text-dim">Executable Path:</span>
          <code
            data-testid="cli-path"
            style={{
              wordBreak: 'break-all',
              padding: '3px 6px',
              borderRadius: '4px',
              background: 'rgba(0,0,0,0.2)',
              fontSize: '11px',
            }}
          >
            {cli.path || '未找到可执行文件 (Not in PATH)'}
          </code>
        </div>
      </div>

      {/* Capabilities Pill List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="text-dim text-xs">Capabilities 支持:</span>
        <div
          data-testid="cli-capabilities"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}
        >
          {cli.capabilities.map((cap) => (
            <span
              key={cap}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Usage Recommendation */}
      <div
        data-testid="cli-recommendation"
        style={{
          marginTop: 'auto',
          padding: '8px',
          borderRadius: '6px',
          background: 'rgba(0,0,0,0.15)',
          fontSize: '11px',
          lineHeight: 1.4,
          color: 'var(--text-muted, #94a3b8)',
        }}
      >
        <strong>使用建议: </strong>
        {cli.usageRecommendation}
      </div>

      {/* Error / Quick Config Guidance */}
      {cli.error && (
        <div
          style={{
            fontSize: '11px',
            color: '#f59e0b',
            padding: '6px 8px',
            borderRadius: '4px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          {cli.error}
        </div>
      )}
    </div>
  );
}
