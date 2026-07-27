/**
 * Slice 40 · 运维叙事 + Select + Run 观测收口 · 轻量断言骨架（不启服）
 *
 * 可复用 selector / 文案约定，供 Playwright CLI 或人工核对：
 * 1. Settings 顶区 data-testid=settings-first-steps；红项锚 #settings-check-{id}
 * 2. 指派 / 优先级 / Squad leader 使用共用 Select（class ma-select）
 * 3. Run 事件抽屉：失败条 run-event-drawer-failure + 主 CTA；body 近底才吸底
 * 4. Wiki jobs：loading=TableSkeleton，error=ErrorState，无裸「加载中…」
 */

export const SLICE40 = {
  settings: {
    firstSteps: '[data-testid="settings-first-steps"]',
    firstStepsOk: '[data-testid="settings-first-steps-ok"]',
    firstStep: '[data-testid="settings-first-step"]',
    firstStepLink: '[data-testid="settings-first-step-link"]',
    checkAnchor: (id: string) => `#settings-check-${id}`,
    checkRow: '[data-testid="settings-check-row"]',
    okCopy: '环境诊断正常，可以继续派活。',
  },
  select: {
    className: 'ma-select',
    assignee: '[data-testid="assignee-select"]',
    newIssuePriority: '[data-testid="new-issue-priority"]',
    newIssueAssignee: '[data-testid="new-issue-assignee"]',
    issuePriority: '[data-testid="issue-props-priority"]',
    squadLeader: '[data-testid="squad-leader-select"]',
    squadCreateLeader: '[data-testid="squad-create-leader-select"]',
  },
  runDrawer: {
    root: '[data-testid="run-event-drawer"]',
    body: '[data-testid="run-event-drawer-body"]',
    failure: '[data-testid="run-event-drawer-failure"]',
    failureTitle: '[data-testid="run-event-drawer-failure-title"]',
    recoveryCta: '[data-testid="run-event-drawer-recovery-cta"]',
    nearBottomPx: 100,
  },
  wikiJobs: {
    loading: '[data-testid="wiki-jobs-loading"]',
    error: '[data-testid="wiki-jobs-error"]',
    table: '[data-testid="wiki-jobs-table"]',
    bareLoadingText: '加载中…',
    tableSkeleton: '.table-skeleton',
  },
} as const;

export function assertSettingsFirstStepsPresent(html: string): boolean {
  return html.includes('data-testid="settings-first-steps"');
}

export function assertNotBareWikiJobsLoading(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  return t !== SLICE40.wikiJobs.bareLoadingText;
}

if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('e2e-slice40-ops-select-run.mts')
) {
  console.log('Slice 40 ops/select/run selectors:');
  console.log(JSON.stringify(SLICE40, null, 2));
  console.log(
    'Manual: /settings → first-steps card; open failed run drawer → failure CTA; /wiki jobs loading skeleton.',
  );
}
