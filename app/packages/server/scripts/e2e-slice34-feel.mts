/**
 * Slice 34 交互手感债 · 轻量断言骨架（不启服）
 *
 * 可复用 selector / 文案约定，供 Playwright CLI 或人工核对：
 * 1. 详情主路径加载态用 PageSkeleton，不是整页唯一「加载中…」
 * 2. ErrorState 默认「出了点问题」+「重试」
 * 3. WS 断线条 data-testid=ws-connection-banner +「刷新本页」
 */

export const SLICE34 = {
  loadingTestIds: [
    'issue-detail-loading',
    'agent-detail-loading',
    'squad-detail-loading',
    'run-detail-loading',
  ],
  pageSkeleton: '.page-skeleton',
  bareLoadingText: '加载中…',
  errorState: {
    defaultTitle: '出了点问题',
    retryLabel: '重试',
    role: 'alert',
  },
  wsBanner: {
    root: '[data-testid="ws-connection-banner"]',
    refresh: '[data-testid="ws-connection-refresh"]',
    refreshLabel: '刷新本页',
    recoveredToast: '实时连接已恢复',
  },
  dialogs: {
    wikiQuery: '.modal-dialog[role="dialog"]',
    runEventDrawer: '[data-testid="run-event-drawer"]',
    memoryDetail: '[data-testid="memory-detail-drawer"]',
    helperRail: '[data-testid="helper-rail"]',
  },
  detailPaths: {
    issue: (id: string) => `/issues/${id}`,
    agent: (id: string) => `/agents/${id}`,
    squad: (id: string) => `/squads/${id}`,
    run: (id: string) => `/runs/${id}`,
  },
} as const;

/** 断言：容器主文案不应仅为「加载中…」 */
export function assertNotBareLoadingOnly(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  return t !== SLICE34.bareLoadingText && t !== '加载运行…';
}

if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('e2e-slice34-feel.mts')
) {
  console.log('Slice 34 feel selectors:');
  console.log(JSON.stringify(SLICE34, null, 2));
  console.log(
    'Manual: open detail routes while throttling network → expect .page-skeleton, not bare 加载中…',
  );
  console.log(
    `ErrorState defaults: title="${SLICE34.errorState.defaultTitle}" retry="${SLICE34.errorState.retryLabel}"`,
  );
}
