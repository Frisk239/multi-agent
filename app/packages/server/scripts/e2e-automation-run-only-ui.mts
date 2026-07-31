import { chromium } from 'playwright';

const out = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto('http://localhost:3000/automation', { waitUntil: 'networkidle', timeout: 20000 });
  out.push({ step: 'load', pass: true, note: 'ok' });

  // open blank form
  const blank = page.getByRole('button', { name: /从空白开始/ });
  await blank.click();
  await page.waitForTimeout(600);
  const mode = page.getByTestId('automation-execution-mode');
  const modeVisible = await mode.isVisible();
  out.push({ step: 'execution-mode-select', pass: modeVisible, note: modeVisible ? 'visible after 从空白开始' : 'hidden' });
  if (modeVisible) {
    await mode.selectOption('run_only');
    out.push({ step: 'select-run_only', pass: (await mode.inputValue()) === 'run_only', note: await mode.inputValue() });
  }

  // existing run_only rule badge
  const badge = page.locator('[data-testid^="automation-mode-"]').first();
  await badge.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const text = (await badge.isVisible()) ? await badge.innerText() : '';
  out.push({ step: 'ui-run_only-badge', pass: text.includes('仅派活'), note: text || 'missing' });

  // create another via UI
  if (modeVisible) {
    await page.locator('input').filter({ hasText: '' }).first().fill('ui-created-run-only').catch(() => {});
    // name field is first text input in form
    const nameInput = page.locator('[data-testid="automation-create-form"] input').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('ui-created-run-only');
      await mode.selectOption('run_only');
      // assignee select first agent option
      const assignee = page.locator('[data-testid="automation-create-form"] select').first();
      // may be custom Select - try native select for execution mode already set
      const selects = page.locator('[data-testid="automation-create-form"] select');
      const count = await selects.count();
      // pick assignee: last select often
      for (let i = 0; i < count; i++) {
        const opts = await selects.nth(i).locator('option').allTextContents();
        if (opts.some((o) => o.includes('agent:') || o.includes('产品') || o.includes('智能'))) {
          const val = await selects.nth(i).locator('option').nth(1).getAttribute('value');
          if (val) await selects.nth(i).selectOption(val);
        }
      }
      // title may already have default
      const createSubmit = page.locator('[data-testid="automation-create-form"] button[type="submit"]');
      if (await createSubmit.isEnabled()) {
        await createSubmit.click();
        await page.waitForTimeout(1000);
        const body = await page.innerText('body');
        out.push({ step: 'ui-create-submit', pass: body.includes('ui-created-run-only'), note: body.includes('ui-created-run-only') ? 'listed' : 'not listed' });
      } else {
        out.push({ step: 'ui-create-submit', pass: false, note: 'submit disabled' });
      }
    }
  }
} catch (e) {
  out.push({ step: 'exception', pass: false, note: String(e) });
} finally {
  await browser.close();
}
const fail = out.filter((r) => !r.pass).length;
for (const r of out) console.log((r.pass ? 'PASS' : 'FAIL') + ' ' + r.step + ' · ' + r.note);
console.log('summary pass=' + (out.length - fail) + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
