/**
 * Issue 评论线程与结论 UI — 隔离 current-source 浏览器验收。
 *
 * 前置：隔离 DB 的 server + 与它同源 API 配置的 current-source web 已启动。
 * 例如：SERVER=http://127.0.0.1:3101 WEB=http://localhost:3100 \
 *   pnpm exec tsx scripts/e2e-issue-comment-thread-conclusion.mts
 */
import { chromium } from 'playwright';

const SERVER = (process.env.SERVER ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
// Server 的默认 CORS origin 是 localhost:3000；保留 127 server，Web 默认则必须匹配。
const WEB = (process.env.WEB ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.MA_LOCAL_TOKEN ?? process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '';

function fail(message: string): never {
  throw new Error(message);
}

function apiHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(TOKEN ? { 'X-MA-Token': TOKEN } : {}),
  };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SERVER}${path}`, {
    method,
    headers: apiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 后续错误会带原始文本，方便判断是否是 API 配置而不是 UI 回归。
  }
  if (!response.ok) {
    fail(`${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return data as T;
}

type CommentResponse = {
  id: string;
  parentCommentId?: string | null;
};

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      return chromium.launch({ channel: 'msedge', headless: true });
    }
  }
}

async function main(): Promise<void> {
  const webProbe = await fetch(WEB, { signal: AbortSignal.timeout(10_000) }).catch(
    () => null,
  );
  if (!webProbe || webProbe.status >= 500) {
    fail(`WEB unavailable: ${WEB}`);
  }

  const issue = await api<{ id: string }>('POST', '/api/issues', {
    title: `E2E 评论线程结论 ${Date.now()}`,
    description: 'isolated current-source verification',
    status: 'todo',
  });
  if (!issue.id) fail('create issue response does not include id');
  const issueId = issue.id;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15_000);
    await page.goto(`${WEB}/issues/${encodeURIComponent(issueId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByTestId('issue-detail').waitFor();
    await page.getByTestId('activity-tab-comments').click();
    await page.getByTestId('issue-timeline').waitFor();

    const rootPost = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/issues/${issueId}/comments`),
    );
    await page.getByTestId('comment-composer-textarea').fill('根评论：请给出结论');
    await page.getByTestId('comment-submit-btn').click();
    const root = (await (await rootPost).json()) as CommentResponse;
    if (!root.id) fail('root comment response does not include id');
    await page.getByTestId(`timeline-thread-${root.id}`).waitFor();

    async function sendReply(body: string): Promise<CommentResponse> {
      await page.getByTestId(`timeline-thread-reply-${root.id}`).click();
      await page.getByTestId('composer-reply-target').waitFor();
      const replyPost = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes(`/api/issues/${issueId}/comments`),
      );
      await page.getByTestId('comment-composer-textarea').fill(body);
      await page.getByTestId('comment-submit-btn').click();
      const reply = (await (await replyPost).json()) as CommentResponse;
      if (!reply.id || reply.parentCommentId !== root.id) {
        fail(`reply response misses parentCommentId=${root.id}`);
      }
      await page.getByTestId(`timeline-item-${reply.id}`).waitFor();
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="composer-reply-target"]'),
      );
      return reply;
    }

    const firstReply = await sendReply('第一条讨论回复');
    const resolutionReply = await sendReply('最后一条回复，作为结论');
    console.log('  ✅ root → two replies（POST parentCommentId）');

    // 刷新后仍必须归在根评论的 replies 区，不能退回平铺 Timeline。
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('activity-tab-comments').click();
    const nestedReply = page.getByTestId(`timeline-item-${firstReply.id}`);
    await nestedReply.waitFor();
    const nestedRole = await nestedReply.getAttribute('data-thread-role');
    if (nestedRole !== 'reply') {
      fail(`reply not nested after reload; data-thread-role=${nestedRole ?? 'null'}`);
    }
    console.log('  ✅ reload 后保持 root + one-level replies 嵌套');

    const resolvePost = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/comments/${root.id}/resolve`),
    );
    await page.getByTestId(`timeline-thread-resolve-${root.id}`).click();
    await resolvePost;
    await page.getByTestId(`timeline-thread-unresolve-${root.id}`).waitFor();
    if (await page.getByTestId(`timeline-item-${firstReply.id}`).count()) {
      fail('resolved thread still shows non-resolution reply by default');
    }
    if (!(await page.getByTestId(`timeline-item-${resolutionReply.id}`).count())) {
      fail('resolved thread does not show resolution reply');
    }
    console.log('  ✅ resolve 后默认只显示 root + 最后回复结论');

    const toggle = page.getByTestId(`timeline-thread-toggle-${root.id}`);
    await toggle.waitFor();
    if ((await toggle.getAttribute('aria-expanded')) !== 'false') {
      fail('resolved thread toggle must start collapsed');
    }
    await toggle.click();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      fail('resolved thread expand control did not update aria-expanded');
    }
    if (!(await page.getByTestId(`timeline-item-${firstReply.id}`).count())) {
      fail('expanded resolved thread does not restore hidden reply');
    }
    await toggle.click();
    console.log('  ✅ resolved thread 可访问地展开/收起');

    const unresolvePost = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/comments/${root.id}/unresolve`),
    );
    await page.getByTestId(`timeline-thread-unresolve-${root.id}`).click();
    await unresolvePost;
    await page.getByTestId(`timeline-thread-resolve-${root.id}`).waitFor();
    if (!(await page.getByTestId(`timeline-item-${firstReply.id}`).count())) {
      fail('unresolve did not restore all replies');
    }
    console.log('  ✅ unresolve 恢复全部 replies 与 resolve action');
  } finally {
    await browser?.close();
    // 即使误指向共享开发库，也只清理本脚本创建的唯一临时 Issue。
    await api<void>('DELETE', `/api/issues/${issueId}`).catch((error) => {
      console.warn(`cleanup DELETE /api/issues/${issueId} failed:`, error);
    });
  }

  console.log('==== Issue comment thread conclusion E2E: PASS ====');
}

void main();
