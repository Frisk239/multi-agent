import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const DB_PATH = process.env.DB_PATH ?? './e2e-playwright.db';

type IdRow = { id: string };

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const zeroRunThreadId = `chat-delete-zero-${suffix}`;
  const protectedThreadId = `chat-delete-protected-${suffix}`;
  const protectedRunId = `chat-delete-protected-run-${suffix}`;
  const zeroRunMessageId = `chat-delete-zero-message-${suffix}`;
  const originalTitle = `可删除会话 ${suffix}`;
  const renamedTitle = `改名后的会话 ${suffix}`;
  const protectedTitle = `保留运行记录 ${suffix}`;
  const now = Date.now();
  const db = new Database(DB_PATH);
  const agent = db.prepare('SELECT id FROM agent ORDER BY id LIMIT 1').get() as IdRow | undefined;
  if (!agent) {
    db.close();
    throw new Error('e2e DB lacks an agent fixture');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    sessionStorage.setItem('ma.day0-onboarding.v2.dismissed', '1');
  });
  const failures: string[] = [];
  const check = (ok: boolean, name: string, note: string) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name} — ${note}`);
    if (!ok) failures.push(`${name}: ${note}`);
  };

  const itemFor = (id: string) =>
    page.locator('.chat-thread-li').filter({ has: page.locator(`[data-thread-id="${id}"]`) });

  try {
    db.prepare(
      `INSERT INTO chat_thread (id, agent_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    ).run(
      zeroRunThreadId, agent.id, originalTitle, now, now,
      protectedThreadId, agent.id, protectedTitle, now + 1, now + 1,
    );
    db.prepare(
      `INSERT INTO chat_message (id, thread_id, role, body, run_id, created_at)
       VALUES (?, ?, 'user', ?, NULL, ?)`,
    ).run(zeroRunMessageId, zeroRunThreadId, '这条消息应随会话 cascade 删除', now);
    db.prepare(
      `INSERT INTO agent_run
        (id, issue_id, chat_thread_id, agent_id, runtime, status, kind, priority,
         is_leader, session_poisoned, attempt, max_attempts, created_at)
       VALUES (?, NULL, ?, ?, 'opencode', 'completed', 'chat', 'none', 0, 0, 1, 2, ?)`,
    ).run(protectedRunId, protectedThreadId, agent.id, now + 2);

    // —— 标题行内编辑：Enter 提交，列表和头部同一标题 ——
    await page.goto(`${WEB}/chat?thread=${encodeURIComponent(zeroRunThreadId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await page.getByTestId('chat-title-edit').waitFor({ timeout: 15_000 });
    await page.getByTestId('chat-title-edit').click();
    await page.getByTestId('chat-title-input').fill(`  ${renamedTitle}  `);
    await page.getByTestId('chat-title-input').press('Enter');
    await page.getByTestId('chat-title-edit').getByText(renamedTitle, { exact: true }).waitFor({ timeout: 15_000 });
    check(
      (db.prepare('SELECT title FROM chat_thread WHERE id = ?').get(zeroRunThreadId) as { title?: string } | undefined)?.title === renamedTitle,
      '标题 Enter 提交经过服务端 trim',
      renamedTitle,
    );
    check(
      await itemFor(zeroRunThreadId).getByText(renamedTitle, { exact: true }).count() === 1,
      '标题栏与会话列表立即一致',
      renamedTitle,
    );

    // —— 归档后，零 run 会话可确认永久删除，消息需 cascade 清理 ——
    const zeroActiveItem = itemFor(zeroRunThreadId);
    await zeroActiveItem.hover();
    await zeroActiveItem.getByTestId('chat-thread-archive').click();
    await page.waitForURL((url) => url.pathname === '/chat' && !url.searchParams.has('thread'), { timeout: 15_000 });
    await page.getByTestId('chat-scope-archived').click();
    await page.locator(`[data-thread-id="${zeroRunThreadId}"]`).waitFor({ timeout: 15_000 });
    await page.locator(`[data-thread-id="${zeroRunThreadId}"]`).click();
    await page.waitForURL((url) => url.searchParams.get('thread') === zeroRunThreadId, { timeout: 15_000 });
    const zeroArchivedItem = itemFor(zeroRunThreadId);
    await zeroArchivedItem.hover();
    await zeroArchivedItem.getByTestId('chat-thread-delete').click();
    await page.getByTestId('confirm-dialog').waitFor({ timeout: 10_000 });
    await page.getByTestId('confirm-dialog-confirm').click();
    await page.waitForURL((url) => url.pathname === '/chat' && !url.searchParams.has('thread'), { timeout: 15_000 });
    await page.locator(`[data-thread-id="${zeroRunThreadId}"]`).waitFor({ state: 'detached', timeout: 15_000 });
    check(
      (db.prepare('SELECT count(*) AS count FROM chat_thread WHERE id = ?').get(zeroRunThreadId) as { count: number }).count === 0,
      '归档的零 run 会话被永久删除',
      zeroRunThreadId,
    );
    check(
      (db.prepare('SELECT count(*) AS count FROM chat_message WHERE id = ?').get(zeroRunMessageId) as { count: number }).count === 0,
      '会话删除 cascade 清理消息',
      zeroRunMessageId,
    );

    // —— 有任意历史 run 的会话：先归档，DELETE 必须 409，并且 Run 仍能在 /runs 找到 ——
    await page.getByTestId('chat-scope-active').click();
    await page.locator(`[data-thread-id="${protectedThreadId}"]`).waitFor({ timeout: 15_000 });
    const protectedActiveItem = itemFor(protectedThreadId);
    await protectedActiveItem.hover();
    await protectedActiveItem.getByTestId('chat-thread-archive').click();
    await page.getByTestId('chat-scope-archived').click();
    await page.locator(`[data-thread-id="${protectedThreadId}"]`).waitFor({ timeout: 15_000 });
    await page.locator(`[data-thread-id="${protectedThreadId}"]`).click();
    await page.waitForURL((url) => url.searchParams.get('thread') === protectedThreadId, { timeout: 15_000 });
    const protectedArchivedItem = itemFor(protectedThreadId);
    await protectedArchivedItem.hover();
    await protectedArchivedItem.getByTestId('chat-thread-delete').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await page.getByText('为保留运行记录，无法删除', { exact: true }).waitFor({ timeout: 15_000 });
    check(
      (db.prepare('SELECT count(*) AS count FROM chat_thread WHERE id = ?').get(protectedThreadId) as { count: number }).count === 1,
      '有 run 的归档会话被服务端拒绝删除',
      protectedThreadId,
    );
    check(
      (db.prepare('SELECT count(*) AS count FROM agent_run WHERE id = ? AND chat_thread_id = ?').get(protectedRunId, protectedThreadId) as { count: number }).count === 1,
      '409 不会删除或置空运行历史',
      protectedRunId,
    );

    await page.goto(`${WEB}/runs?status=all&run=${encodeURIComponent(protectedRunId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await page.locator(`[data-run-id="${protectedRunId}"]`).waitFor({ timeout: 15_000 });
    check(
      await page.locator(`[data-run-id="${protectedRunId}"]`).count() === 1,
      '被保护的 chat run 仍在 /runs 可见',
      protectedRunId,
    );
  } finally {
    await browser.close();
    db.prepare('DELETE FROM agent_run WHERE id = ?').run(protectedRunId);
    db.prepare('DELETE FROM chat_thread WHERE id IN (?, ?)').run(zeroRunThreadId, protectedThreadId);
    db.close();
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('==== Chat title and safe delete：PASS ====');
}

void main();
