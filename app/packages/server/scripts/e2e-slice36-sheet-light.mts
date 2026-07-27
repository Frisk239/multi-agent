/**
 * Slice 36 · Issue Sheet 轻量模式（不启服 selector 骨架）
 *
 * 路径：
 * 1. 看板 / 点卡 → ?issue= → [data-testid=issue-side-sheet]
 * 2. Sheet 内 IssueDetail data-variant=sheet：状态/指派/评论/最近运行
 * 3. 无属性栏长卷 / 无知识沉淀默认展开
 * 4. Esc / 关闭 / 全页深链不回归
 */

export const SLICE36 = {
  board: '/',
  issueParam: 'issue',
  sheet: '[data-testid="issue-side-sheet"]',
  sheetClose: '[data-testid="issue-side-sheet-close"]',
  sheetBackdrop: '[data-testid="issue-side-sheet-backdrop"]',
  sheetFullpage: '[data-testid="issue-side-sheet-fullpage"]',
  cardTitle: '[data-testid="issue-card-title-link"]',
  listTitle: '[data-testid="issue-list-title-link"]',
  detail: '[data-testid="issue-detail"]',
  detailVariantAttr: 'data-variant',
  sheetMeta: '[data-testid="issue-sheet-meta"]',
  sheetStatus: '[data-testid="issue-sheet-status"]',
  sheetAssignee: '[data-testid="issue-sheet-assignee"]',
  sheetMore: '[data-testid="issue-sheet-more"]',
  sheetOpenFullpage: '[data-testid="issue-sheet-open-fullpage"]',
  replyZone: '[data-testid="issue-reply-zone"]',
  execSection: '[data-testid="issue-exec-section"]',
  execSheetLightAttr: 'data-sheet-light',
  runStatusBar: '[data-testid="run-status-bar"]',
  /** page-only（Sheet 中应不出现） */
  propsRail: '[data-testid="issue-props-rail"]',
  propsToggle: '[data-testid="issue-props-toggle"]',
  activityTabLog: '[data-testid="activity-tab-log"]',
  knowledgeWiki: '沉淀至 Wiki',
  fullPage: (id: string) => `/issues/${id}`,
  sheetUrl: (id: string, extra = '') => {
    const sp = new URLSearchParams(extra);
    sp.set('issue', id);
    return `/?${sp.toString()}`;
  },
} as const;

/** Sheet 轻量：应有 / 不应有 的 testid 约定 */
export function assertSheetLightDom(root: {
  querySelector: (sel: string) => Element | null;
  getAttribute?: (name: string) => string | null;
}): { ok: boolean; missing: string[]; unexpected: string[] } {
  const missing: string[] = [];
  const unexpected: string[] = [];
  const detail = root.querySelector(SLICE36.detail);
  if (!detail) missing.push(SLICE36.detail);
  else if (detail.getAttribute(SLICE36.detailVariantAttr) !== 'sheet') {
    missing.push(`${SLICE36.detail}[${SLICE36.detailVariantAttr}=sheet]`);
  }
  for (const sel of [
    SLICE36.sheetMeta,
    SLICE36.sheetStatus,
    SLICE36.sheetAssignee,
    SLICE36.replyZone,
    SLICE36.execSection,
  ]) {
    if (!root.querySelector(sel)) missing.push(sel);
  }
  for (const sel of [SLICE36.propsRail, SLICE36.propsToggle, SLICE36.activityTabLog]) {
    if (root.querySelector(sel)) unexpected.push(sel);
  }
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected };
}

if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('e2e-slice36-sheet-light.mts')
) {
  console.log('Slice 36 Issue Sheet light selectors:');
  console.log(JSON.stringify(SLICE36, null, 2));
  console.log(
    'Manual: board → card title → sheet data-variant=sheet + meta/status/assignee/comments/recent run; Esc closes; /issues/:id full page keeps props.',
  );
}
