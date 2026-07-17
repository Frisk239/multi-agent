'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSettingsStatus } from '@/lib/api';

const DISMISS_KEY = 'ma.envBanner.cwdDismissed';

/** 全局轻提示：cwd 阻塞时顶栏；可本会话 dismiss */
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

  const cwd = data?.checks?.find((c) => c.id === 'cwd');
  const blocked = cwd?.status === 'error';
  // 设置页已有完整诊断，避免重复噪音
  const onSettings = pathname === '/settings' || pathname.startsWith('/settings/');

  if (!blocked || dismissed || onSettings) return null;

  return (
    <div
      className="env-banner"
      data-testid="env-banner"
      data-check="cwd"
      role="status"
    >
      <div className="env-banner-main">
        <strong>工作区未就绪</strong>
        <span>
          {cwd?.detail ?? '未配置 MA_WORKSPACE_CWD'}
          {cwd?.hint ? ` · ${cwd.hint}` : ''}
        </span>
      </div>
      <div className="env-banner-actions">
        <Link href="/settings" className="env-banner-link" data-testid="env-banner-settings">
          环境诊断
        </Link>
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
