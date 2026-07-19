'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSettingsStatus } from '@/lib/api';

const DISMISS_KEY = 'ma.envBanner.dismissed';

type BannerKind = 'cwd' | 'wiki_llm' | 'runtime' | null;

/** 全局轻提示：阻塞环境时顶栏；可本会话 dismiss */
export function EnvBanner() {
  const pathname = usePathname();
  const { data } = useSettingsStatus();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const checks = data?.checks ?? [];
  const cwd = checks.find((c) => c.id === 'cwd');
  const wikiLlm = checks.find((c) => c.id === 'wiki_llm');
  const runtimeErrors = checks.filter(
    (c) => c.id.startsWith('runtime:') && c.status === 'error',
  );

  const kind: BannerKind = useMemo(() => {
    if (cwd?.status === 'error') return 'cwd';
    if (wikiLlm?.status === 'error') return 'wiki_llm';
    if (runtimeErrors.length > 0) return 'runtime';
    return null;
  }, [cwd?.status, wikiLlm?.status, runtimeErrors.length]);

  // 设置页已有完整诊断，避免重复噪音
  const onSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  const onWiki = pathname === '/wiki' || pathname.startsWith('/wiki/');

  if (!kind || dismissed || onSettings) return null;
  // Wiki 页已有 LLM banner 时不叠 wiki_llm
  if (kind === 'wiki_llm' && onWiki) return null;

  const title =
    kind === 'cwd'
      ? '工作区未就绪'
      : kind === 'wiki_llm'
        ? 'Wiki LLM 未就绪'
        : '运行时 CLI 缺失';

  const detail =
    kind === 'cwd'
      ? (() => {
          const src = data?.cwd?.source;
          const path = data?.cwd?.path ?? cwd?.detail ?? '未配置工作区路径';
          const base =
            src && src !== 'none'
              ? `${path}（来源 ${src}${data?.cwd?.exists === false ? ' · 路径无效' : ''}）`
              : path;
          const hint =
            cwd?.hint ??
            '在 Settings 保存工作区绝对路径，或设置 MA_WORKSPACE_CWD';
          return `${base} · ${hint}`;
        })()
      : kind === 'wiki_llm'
        ? `${wikiLlm?.detail ?? '未配置 WIKI_LLM_API_KEY'}${wikiLlm?.hint ? ` · ${wikiLlm.hint}` : ''}`
        : runtimeErrors.map((c) => c.label).join('、') + ' 探测失败';

  return (
    <div
      className="env-banner"
      data-testid="env-banner"
      data-check={kind}
      role="status"
    >
      <div className="env-banner-main">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="env-banner-actions" data-testid="env-banner-actions">
        <Link href="/settings" className="env-banner-link" data-testid="env-banner-settings">
          {kind === 'cwd' ? '保存工作区路径' : '环境诊断'}
        </Link>
        {kind === 'cwd' ? (
          <>
            <Link
              href="/agents?ready=cwd_missing"
              className="env-banner-link"
              data-testid="env-banner-agents-cwd"
            >
              智能体 cwd
            </Link>
            <Link
              href="/runs?status=failed"
              className="env-banner-link"
              data-testid="env-banner-failed-runs"
            >
              失败运行
            </Link>
          </>
        ) : null}
        {kind === 'wiki_llm' ? (
          <>
            <Link
              href="/wiki?jobStatus=dead"
              className="env-banner-link"
              data-testid="env-banner-wiki-dead"
            >
              dead 任务
            </Link>
            <Link href="/wiki" className="env-banner-link" data-testid="env-banner-wiki">
              Wiki
            </Link>
          </>
        ) : null}
        {kind === 'runtime' ? (
          <>
            <Link href="/runtimes" className="env-banner-link" data-testid="env-banner-runtimes">
              运行时探测
            </Link>
            <Link
              href="/agents?ready=runtime_missing"
              className="env-banner-link"
              data-testid="env-banner-agents-runtime"
            >
              受影响智能体
            </Link>
          </>
        ) : null}
        <button
          type="button"
          className="env-banner-dismiss"
          data-testid="env-banner-dismiss"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, '1');
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
        >
          本会话隐藏
        </button>
      </div>
    </div>
  );
}
