/**
 * Slice 32 骨架验收（Playwright CLI / 手工路径镜像）
 *
 * 路径：
 * 1. 打开 / → 点 issue 卡标题 → URL 含 ?issue= → [data-testid=issue-side-sheet]
 * 2. Esc / 关闭 → 去掉 issue 参数
 * 3. /issues/[id] 全页深链仍可用
 *
 * 本脚本不启服；仅导出可复用 selector 与 URL 约定，供 CLI 或人工核对。
 */

export const SLICE32 = {
  board: '/',
  issueParam: 'issue',
  sheet: '[data-testid="issue-side-sheet"]',
  sheetClose: '[data-testid="issue-side-sheet-close"]',
  sheetBackdrop: '[data-testid="issue-side-sheet-backdrop"]',
  cardTitle: '[data-testid="issue-card-title-link"]',
  listTitle: '[data-testid="issue-list-title-link"]',
  fullPage: (id: string) => `/issues/${id}`,
  sheetUrl: (id: string, extra = '') => {
    const sp = new URLSearchParams(extra);
    sp.set('issue', id);
    return `/?${sp.toString()}`;
  },
} as const;

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('e2e-slice32-issue-sheet.mts')) {
  console.log('Slice 32 Issue Side Sheet selectors:');
  console.log(JSON.stringify(SLICE32, null, 2));
  console.log('Manual: open board, click card title, assert sheet + ?issue=, Esc closes.');
}
