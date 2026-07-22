'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProjects, useSettingsStatus } from '@/lib/api';

const DONE_KEY = 'ma.onboarding.v1';
const DISMISS_SESSION = 'ma.onboarding.dismissed';

/**
 * E1 Day-0：冷启动 3 步（CLI → Project 绑 path → 派第一条 Issue）
 * localStorage 完成；sessionStorage 本会话跳过。
 */
export function OnboardingCard() {
  const pathname = usePathname();
  const { data: settings } = useSettingsStatus();
  const { data: projects = [] } = useProjects();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const done = localStorage.getItem(DONE_KEY) === 'done';
      const dismissed = sessionStorage.getItem(DISMISS_SESSION) === '1';
      setHidden(done || dismissed);
    } catch {
      setHidden(false);
    }
    setReady(true);
  }, []);

  const checks = settings?.checks ?? [];
  const runtimeOk = useMemo(() => {
    const rts = checks.filter((c) => c.id.startsWith('runtime:'));
    if (rts.length === 0) return false;
    return rts.some((c) => c.status === 'ok' || c.status === 'warn');
  }, [checks]);
  const runtimeAny = checks.some((c) => c.id.startsWith('runtime:'));

  const projectsWithPath = projects.filter(
    (p) => Boolean(p.localPath?.trim()) && p.localPathExists !== false,
  );
  const step2Ok = projectsWithPath.length > 0;

  // 三步都绿时自动完成（避免老用户被刷）
  useEffect(() => {
    if (!ready || hidden) return;
    if (runtimeOk && step2Ok) {
      try {
        localStorage.setItem(DONE_KEY, 'done');
      } catch {
        /* ignore */
      }
      setHidden(true);
    }
  }, [ready, hidden, runtimeOk, step2Ok]);

  const onQuietPage =
    pathname.startsWith('/settings') ||
    pathname.startsWith('/runtimes') ||
    pathname.startsWith('/chat');

  if (!ready || hidden || onQuietPage) return null;

  function finish() {
    try {
      localStorage.setItem(DONE_KEY, 'done');
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  function dismissSession() {
    try {
      sessionStorage.setItem(DISMISS_SESSION, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  return (
    <section
      className="onboarding-card"
      data-testid="onboarding-card"
      aria-label="快速开始"
    >
      <div className="onboarding-card-head">
        <div>
          <h2 className="onboarding-card-title">快速开始 · 3 步派活</h2>
          <p className="onboarding-card-desc text-dim text-sm">
            默认在隔离目录执行；要改真仓请先绑定项目本机路径。与 Multica「local_directory
            显式进仓」一致。
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
            data-testid="onboarding-finish"
            onClick={finish}
          >
            完成引导
          </button>
        </div>
      </div>
      <ol className="onboarding-steps">
        <li
          className={`onboarding-step${runtimeOk ? ' is-done' : ''}`}
          data-testid="onboarding-step-runtime"
          data-done={runtimeOk ? '1' : '0'}
        >
          <span className="onboarding-step-num" aria-hidden>
            {runtimeOk ? '✓' : '1'}
          </span>
          <div className="onboarding-step-body">
            <strong>本机 CLI</strong>
            <p className="text-dim text-sm">
              {runtimeAny
                ? runtimeOk
                  ? '已探测到可用运行时'
                  : '尚未探测到可用 CLI（Claude / opencode / Cursor…）'
                : '打开本机 CLI 页完成探测'}
            </p>
            <Link href="/runtimes" className="btn btn-secondary btn-sm">
              打开本机 CLI
            </Link>
          </div>
        </li>
        <li
          className={`onboarding-step${step2Ok ? ' is-done' : ''}`}
          data-testid="onboarding-step-project"
          data-done={step2Ok ? '1' : '0'}
        >
          <span className="onboarding-step-num" aria-hidden>
            {step2Ok ? '✓' : '2'}
          </span>
          <div className="onboarding-step-body">
            <strong>项目 · 本机路径</strong>
            <p className="text-dim text-sm">
              {step2Ok
                ? `已有 ${projectsWithPath.length} 个绑定有效路径的项目`
                : '创建项目并填写 localPath（真仓）；不绑则走隔离目录'}
            </p>
            <Link href="/projects" className="btn btn-secondary btn-sm">
              打开项目
            </Link>
          </div>
        </li>
        <li className="onboarding-step" data-testid="onboarding-step-issue">
          <span className="onboarding-step-num" aria-hidden>
            3
          </span>
          <div className="onboarding-step-body">
            <strong>派第一条 Issue</strong>
            <p className="text-dim text-sm">
              看板新建时可选手项目；指派 agent 后到「运行」看 cwd 与轨迹
            </p>
            <Link
              href="/?new=1"
              className="btn btn-primary btn-sm"
              data-testid="onboarding-new-issue"
            >
              新建 Issue
            </Link>
          </div>
        </li>
      </ol>
    </section>
  );
}
