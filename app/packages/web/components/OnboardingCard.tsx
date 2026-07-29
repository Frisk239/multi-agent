'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { API, apiFetch } from '@/lib/api';
import {
  DAY0_SESSION_KEY,
  migrateDay0Storage,
  readDay0Completed,
  writeDay0Completed,
} from '@/lib/day0-onboarding';

type Day0Status = {
  hasRuntimes: boolean;
  installedRuntimesCount: number;
  hasValidProject: boolean;
  validProjectCount: number;
  hasAgents: boolean;
  activeAgentCount: number;
  hasAssignedIssueRun: boolean;
  firstIssueId: string | null;
  firstIssueIdentifier: string | null;
  firstRunId: string | null;
  firstRunStatus: string | null;
  completed: boolean;
};

export function OnboardingCard() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const statusQuery = useQuery({
    queryKey: ['day0-onboarding'],
    queryFn: async (): Promise<Day0Status> => {
      const response = await apiFetch(`${API}/settings/onboarding-status`);
      if (!response.ok) throw new Error(`首启状态加载失败（HTTP ${response.status}）`);
      return response.json();
    },
    enabled: ready && !hidden,
    refetchOnWindowFocus: true,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    try {
      migrateDay0Storage(localStorage, sessionStorage);
      const done = readDay0Completed(localStorage) != null;
      const dismissed = sessionStorage.getItem(DAY0_SESSION_KEY) === '1';
      setHidden(done || dismissed);
    } catch {
      setHidden(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const status = statusQuery.data;
    if (!ready || hidden || !status?.completed) return;
    try {
      writeDay0Completed(localStorage, {
        issueId: status.firstIssueId,
        runId: status.firstRunId,
      });
      setShowSuccess(true);
    } catch {
      // 无 storage 时仍让本次成功去向可见。
      setShowSuccess(true);
    }
  }, [ready, hidden, statusQuery.data]);

  useEffect(() => {
    if (!ready || hidden) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void statusQuery.refetch();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [ready, hidden, statusQuery.refetch]);

  const onQuietPage =
    pathname.startsWith('/settings') ||
    pathname.startsWith('/runtimes') ||
    pathname.startsWith('/chat');

  if (!ready || hidden || onQuietPage) return null;
  const status = statusQuery.data;

  function dismissSession() {
    try {
      sessionStorage.setItem(DAY0_SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  if (showSuccess && status) {
    const destination = status.firstRunId
      ? `/runs?run=${encodeURIComponent(status.firstRunId)}`
      : status.firstIssueId
        ? `/issues/${encodeURIComponent(status.firstIssueId)}`
        : '/runs';
    return (
      <section className="onboarding-card" data-testid="onboarding-success" aria-live="polite">
        <div className="onboarding-card-head">
          <div>
            <h2 className="onboarding-card-title">第一条任务已进入执行链路</h2>
            <p className="onboarding-card-desc text-dim text-sm">
              {status.firstIssueIdentifier ?? 'Issue'} 已指派并关联 Run，可以开始观察输出与恢复状态。
            </p>
          </div>
          <Link href={destination} className="btn btn-primary btn-sm" data-testid="onboarding-open-run">
            查看 Issue / Run
          </Link>
        </div>
      </section>
    );
  }

  if (statusQuery.isError) {
    return (
      <section className="onboarding-card" data-testid="onboarding-error" role="alert">
        <div className="onboarding-card-head">
          <div>
            <h2 className="onboarding-card-title">暂时无法读取首启进度</h2>
            <p className="onboarding-card-desc text-dim text-sm">
              {statusQuery.error instanceof Error ? statusQuery.error.message : '请确认本地 API 已启动'}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => void statusQuery.refetch()}>
            重试
          </button>
        </div>
      </section>
    );
  }

  if (!status) return null;

  const steps = [
    {
      key: 'runtime',
      done: status.hasRuntimes,
      title: '确认本机 CLI',
      detail: status.hasRuntimes
        ? `已探测到 ${status.installedRuntimesCount} 个可用 CLI`
        : '探测 Claude Code、opencode、Cursor 等本机编码 CLI',
      href: '/runtimes',
      cta: '打开本机 CLI',
    },
    {
      key: 'project',
      done: status.hasValidProject,
      title: '绑定项目本机路径',
      detail: status.hasValidProject
        ? `已有 ${status.validProjectCount} 个有效 localPath`
        : '创建或编辑项目，并绑定真实存在的本机目录',
      href: '/projects',
      cta: '打开项目',
    },
    {
      key: 'agent',
      done: status.hasAgents,
      title: '准备 Agent',
      detail: status.hasAgents
        ? `已有 ${status.activeAgentCount} 个活跃 Agent`
        : '创建一个绑定可用 CLI 的 Agent',
      href: '/agents?create=1',
      cta: '创建 Agent',
    },
    {
      key: 'issue',
      done: status.hasAssignedIssueRun,
      title: '派第一条 Issue',
      detail: status.hasAssignedIssueRun
        ? `${status.firstIssueIdentifier ?? 'Issue'} 已关联 ${status.firstRunStatus ?? 'Run'}`
        : '新建 Issue、选择项目并指派 Agent；关联 Run 后完成引导',
      href: '/?new=1',
      cta: '新建并指派 Issue',
    },
  ];

  return (
    <section
      className="onboarding-card"
      data-testid="onboarding-card"
      aria-label="快速开始"
    >
      <div className="onboarding-card-head">
        <div>
          <h2 className="onboarding-card-title">快速开始 · 从本机 CLI 到第一条 Run</h2>
          <p className="onboarding-card-desc text-dim text-sm">
            进度来自本地真实配置；离开创建页再返回或刷新，会从已完成步骤继续。
          </p>
        </div>
        <div className="onboarding-card-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="onboarding-dismiss"
            onClick={dismissSession}
          >
            稍后再说
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            {statusQuery.isFetching ? '刷新中…' : '刷新进度'}
          </button>
        </div>
      </div>
      <ol className="onboarding-steps">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`onboarding-step${step.done ? ' is-done' : ''}`}
            data-testid={`onboarding-step-${step.key}`}
            data-done={step.done ? '1' : '0'}
          >
            <span className="onboarding-step-num" aria-hidden>
              {step.done ? '✓' : index + 1}
            </span>
            <div className="onboarding-step-body">
              <strong>{step.title}</strong>
              <p className="text-dim text-sm">{step.detail}</p>
              <Link href={step.href} className={`btn ${step.key === 'issue' ? 'btn-primary' : 'btn-secondary'} btn-sm`}>
                {step.cta}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
