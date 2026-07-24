'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export function OnboardingWizard() {
  const [status, setStatus] = useState<{
    hasCwd: boolean;
    hasRuntimes: boolean;
    hasAgents: boolean;
    hasIssues: boolean;
    installedRuntimesCount: number;
    agentCount: number;
    completed: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem('ma-onboarding-dismissed') === '1') {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }

    fetch('/api/settings/onboarding-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStatus(data);
      })
      .catch(() => {});
  }, []);

  if (dismissed || !status || status.completed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem('ma-onboarding-dismissed', '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="onboarding-wizard-card"
      data-testid="onboarding-wizard"
      style={{
        margin: '16px 0',
        padding: '16px 20px',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))',
        border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🚀</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>欢迎使用多智能体编排控制台</h3>
            <p className="text-dim text-xs" style={{ margin: '2px 0 0' }}>
              请跟随首启指南完成基础环境与智能体配置，开始编排本地 CLI。
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost btn-xs text-dim"
          data-testid="onboarding-dismiss-btn"
          onClick={handleDismiss}
        >
          不再提示 ×
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>1. 工作区根目录</span>
            <span>{status.hasCwd ? '✅' : '⚠️'}</span>
          </div>
          <p className="text-dim text-xs" style={{ marginTop: 4 }}>
            {status.hasCwd ? '已绑定有效工作区目录' : '未设置 MA_WORKSPACE_CWD'}
          </p>
          {!status.hasCwd ? (
            <Link href="/settings" className="btn-secondary btn-xs" style={{ marginTop: 8 }}>
              配置 CWD
            </Link>
          ) : null}
        </div>

        <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>2. CLI 探针</span>
            <span>{status.hasRuntimes ? '✅' : '⚠️'}</span>
          </div>
          <p className="text-dim text-xs" style={{ marginTop: 4 }}>
            {status.hasRuntimes ? `已检测到 ${status.installedRuntimesCount} 个可用 CLI` : '未探测到 opencode/claude-code'}
          </p>
          <Link href="/runtimes" className="btn-secondary btn-xs" style={{ marginTop: 8 }}>
            探测 CLI
          </Link>
        </div>

        <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>3. 创建智能体</span>
            <span>{status.hasAgents ? '✅' : '⚠️'}</span>
          </div>
          <p className="text-dim text-xs" style={{ marginTop: 4 }}>
            {status.hasAgents ? `已配置 ${status.agentCount} 个智能体` : '暂无可用智能体'}
          </p>
          {!status.hasAgents ? (
            <Link href="/agents" className="btn-primary btn-xs" style={{ marginTop: 8 }}>
              创建首个 Agent
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
