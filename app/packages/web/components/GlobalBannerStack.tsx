'use client';

/**
 * F4 · At most one global top banner by severity.
 * critical: WS disconnect · high: env · low: onboarding stays in-main (not stacked).
 */

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useSettingsStatus } from '@/lib/api';
import { useWsStore } from '@/lib/ws';
import { pickTopBannerId, GLOBAL_BANNER_SEVERITY } from '@/lib/banner-queue';
import { EnvBanner } from './EnvBanner';
import { WsConnectionBanner } from './WsConnectionBanner';

export function GlobalBannerStack() {
  const pathname = usePathname();
  const wsStatus = useWsStore((s) => s.status);
  const { data } = useSettingsStatus();

  const onSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  const onWiki = pathname === '/wiki' || pathname.startsWith('/wiki/');

  const checks = data?.checks ?? [];
  const cwd = checks.find((c) => c.id === 'cwd');
  const wikiLlm = checks.find((c) => c.id === 'wiki_llm');
  const runtimeErrors = checks.filter(
    (c) => c.id.startsWith('runtime:') && c.status === 'error',
  );

  let envKind: 'cwd' | 'wiki_llm' | 'runtime' | null = null;
  if (cwd?.status === 'error') envKind = 'cwd';
  else if (wikiLlm?.status === 'error') envKind = 'wiki_llm';
  else if (runtimeErrors.length > 0) envKind = 'runtime';

  const envActive =
    Boolean(envKind) &&
    !onSettings &&
    !(envKind === 'wiki_llm' && onWiki);

  const wsActive = wsStatus === 'closed' || wsStatus === 'connecting';

  const top = useMemo(
    () =>
      pickTopBannerId([
        { id: 'ws', severity: GLOBAL_BANNER_SEVERITY.ws, active: wsActive },
        { id: 'env', severity: GLOBAL_BANNER_SEVERITY.env, active: envActive },
      ]),
    [wsActive, envActive],
  );

  return (
    <div data-testid="global-banner-stack" data-top={top ?? ''}>
      {top === 'ws' ? <WsConnectionBanner /> : null}
      {top === 'env' ? <EnvBanner /> : null}
    </div>
  );
}
