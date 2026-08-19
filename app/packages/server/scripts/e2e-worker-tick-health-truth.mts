/**
 * Worker tick health truth — Settings 真实页面 + 受控 /api/ops/snapshot。
 *
 * 运行（配合隔离 current-source server/web）：
 *   WEB=http://localhost:3003 pnpm exec tsx scripts/e2e-worker-tick-health-truth.mts
 *
 * 路由拦截只模拟「一次失败快照 → 下一次成功快照」；页面、React Query 刷新按钮和
 * Settings 渲染均使用真实构建产物，避免把 worker 故障注入端点带进产品 API。
 */
import { chromium, type Route } from 'playwright';

const WEB = process.env.WEB ?? 'http://localhost:3000';

function worker(override: Record<string, unknown> = {}) {
  return {
    running: true,
    lastTickAt: 1_000,
    ageMs: 50,
    consecutiveFailures: 0,
    lastFailureAt: null,
    lastFailureSummary: null,
    ...override,
  };
}

function snapshot(degraded: boolean) {
  const now = Date.now();
  return {
    ts: now,
    status: degraded ? 'degraded' : 'ok',
    runs: {
      active: { total: 1, queued: 1, running: 0, waitingLocalDirectory: 0, retryBackoff: 0 },
      queueAge: { count: 1, maxMs: 50, avgMs: 50, p50Ms: 50, p95Ms: 50 },
      eligibleQueueAge: { count: 1, maxMs: 50, avgMs: 50, p50Ms: 50, p95Ms: 50 },
      runningHeartbeatAge: { count: 0, maxMs: null, avgMs: null, p50Ms: null, p95Ms: null },
      queueSamples: [],
      terminalReasons: [],
      terminalWindow: '7d',
    },
    wiki: { dead: 0, pending: 0, running: 0, failed: 0, completed: 0 },
    memory: {
      provider: 'sqlite-text',
      available: true,
      backend: 'sqlite',
      breakerOpen: false,
      breakerFailures: 0,
      breakerOpenUntil: null,
    },
    workers: {
      runWorker: worker(
        degraded
          ? {
              consecutiveFailures: 2,
              lastFailureAt: now - 1,
              lastFailureSummary: 'SQLite busy；下一轮将继续尝试',
            }
          : {},
      ),
      automationWorker: worker(),
      wikiIngestWorker: worker(),
      staleRunSweeper: worker(),
    },
    process: { status: degraded ? 'degraded' : 'ok', uptimeMs: 12_345, db: { ok: true, latencyMs: 1 } },
    automation: { lastError: null, failedRules: 0, lastFailedAt: null },
    sqlite: { path: ':memory:', busyTimeoutMs: 5000, journalMode: 'wal', foreignKeys: true },
    resumeStats: { sessionPoisoned: 0, resumeMiss: 0, deferredUnclaimed: 0, window: '7d' },
    inboxWriteFailures: {},
  };
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let recovered = false;

  try {
    await page.route('**/api/ops/snapshot', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(snapshot(!recovered)),
      });
    });

    await page.goto(`${WEB}/settings?tab=health`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const failedRow = page.getByTestId('settings-ops-worker-runWorker');
    await failedRow.waitFor({ timeout: 15_000 });
    const failedText = await failedRow.innerText();
    if (!failedText.includes('降级：连续失败 2') || !failedText.includes('SQLite busy')) {
      throw new Error(`Settings did not render worker failure truthfully: ${failedText}`);
    }
    if (!((await failedRow.getAttribute('class')) ?? '').includes('is-degraded')) {
      throw new Error('Settings worker failure row is missing the degraded visual state');
    }
    console.log('  ✅ Settings 显示 worker 连续失败、最近失败摘要与降级样式');

    recovered = true;
    await page.getByTestId('settings-ops-snapshot-refresh').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="settings-ops-worker-runWorker-failure"]'),
      undefined,
      { timeout: 15_000 },
    );
    const recoveredText = await page.getByTestId('settings-ops-worker-runWorker').innerText();
    if (recoveredText.includes('连续失败') || recoveredText.includes('降级：')) {
      throw new Error(`Settings did not clear worker failure after successful snapshot: ${recoveredText}`);
    }
    console.log('  ✅ Settings 刷新成功快照后清除 worker 降级文案');
  } finally {
    await browser.close();
  }

  console.log('==== Worker tick health truth Settings Playwright：PASS ====');
}

void main();
