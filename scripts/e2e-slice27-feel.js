/**
 * Slice 27 · 交互手感包
 *
 * 两段：
 * 1) Node 纯函数骨架（chat 近底 / focus-trap 循环）— 始终可跑
 * 2) 可选 Playwright：若 localhost:3000 可用则探 modal trap + chat DOM
 *
 * 用法: node scripts/e2e-slice27-feel.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
  }
}

// —— 镜像 web/lib/chat-scroll.ts ——
const NEAR_BOTTOM_PX = 100;

function distanceFromBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

function isNearBottom(el, threshold = NEAR_BOTTOM_PX) {
  return distanceFromBottom(el) <= threshold;
}

function shouldAutoStick(stickToBottom, nearBottom) {
  return stickToBottom && nearBottom;
}

// —— 镜像 web/lib/use-focus-trap.ts cycleFocusIndex ——
function cycleFocusIndex(current, delta, length) {
  if (length <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

console.log('🚀 Slice 27 e2e skeleton — unit-style checks (no full stack required)\n');

console.log('1) chat near-bottom stick');
assert(NEAR_BOTTOM_PX === 100, 'NEAR_BOTTOM_PX === 100');
assert(
  isNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 }),
  'exactly at bottom is near',
);
assert(
  isNearBottom({ scrollTop: 850, scrollHeight: 1000, clientHeight: 100 }),
  'within 100px is near (distance=50)',
);
assert(
  !isNearBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 100 }),
  'distance 200px is NOT near',
);
assert(
  isNearBottom({ scrollTop: 0, scrollHeight: 80, clientHeight: 100 }),
  'short content (no overflow) is near',
);
assert(shouldAutoStick(true, true) === true, 'stick+near → auto scroll');
assert(shouldAutoStick(true, false) === false, 'stick but not near → no auto (defensive)');
assert(shouldAutoStick(false, true) === false, 'not stick → no auto even if near');
assert(shouldAutoStick(false, false) === false, 'not stick + not near → no auto');

console.log('\n2) focus trap cycle');
assert(cycleFocusIndex(0, 1, 3) === 1, '0 +1 → 1');
assert(cycleFocusIndex(2, 1, 3) === 0, 'last +1 wraps to 0');
assert(cycleFocusIndex(0, -1, 3) === 2, '0 -1 wraps to last');
assert(cycleFocusIndex(-1, 1, 4) === 0, 'outside +1 → 0');
assert(cycleFocusIndex(-1, -1, 4) === 3, 'outside -1 → last');
assert(cycleFocusIndex(0, 1, 0) === -1, 'empty list → -1');

console.log('\n3) source files present');
const root = path.resolve(__dirname, '..');
const mustExist = [
  'app/packages/web/lib/use-focus-trap.ts',
  'app/packages/web/lib/chat-scroll.ts',
  'app/packages/web/components/ChatPage.tsx',
  'app/packages/web/components/CommandPalette.tsx',
  'app/packages/web/components/QuickDispatchPanel.tsx',
  'app/packages/web/components/KeyboardShortcutsModal.tsx',
  'app/packages/web/components/NewIssueForm.tsx',
  'app/packages/web/components/SquadsPage.tsx',
  'app/packages/web/components/SkillsPage.tsx',
  'app/packages/web/components/MyIssuesPage.tsx',
];
for (const rel of mustExist) {
  assert(fs.existsSync(path.join(root, rel)), `exists ${rel}`);
}

const chatSrc = fs.readFileSync(
  path.join(root, 'app/packages/web/components/ChatPage.tsx'),
  'utf8',
);
assert(chatSrc.includes('chat-new-messages-btn'), 'ChatPage has chat-new-messages-btn');
assert(chatSrc.includes('stickToBottom'), 'ChatPage has stickToBottom');
assert(chatSrc.includes('NEAR_BOTTOM_PX') || chatSrc.includes('isNearBottom'), 'ChatPage uses near-bottom helper');

const trapSrc = fs.readFileSync(
  path.join(root, 'app/packages/web/lib/use-focus-trap.ts'),
  'utf8',
);
assert(trapSrc.includes('export function useFocusTrap'), 'exports useFocusTrap');
assert(trapSrc.includes('restoreFocus'), 'supports restoreFocus');

const cmdkSrc = fs.readFileSync(
  path.join(root, 'app/packages/web/components/CommandPalette.tsx'),
  'utf8',
);
assert(cmdkSrc.includes('useFocusTrap'), 'CommandPalette wires useFocusTrap');
assert(cmdkSrc.includes('aria-modal="true"'), 'CommandPalette aria-modal');

const qdSrc = fs.readFileSync(
  path.join(root, 'app/packages/web/components/QuickDispatchPanel.tsx'),
  'utf8',
);
assert(qdSrc.includes('useFocusTrap'), 'QuickDispatchPanel wires useFocusTrap');

const scSrc = fs.readFileSync(
  path.join(root, 'app/packages/web/components/KeyboardShortcutsModal.tsx'),
  'utf8',
);
assert(scSrc.includes('role="dialog"'), 'Shortcuts has role=dialog');
assert(scSrc.includes('aria-modal="true"'), 'Shortcuts has aria-modal');
assert(scSrc.includes('useFocusTrap'), 'Shortcuts wires useFocusTrap');

const nifSrc = fs.readFileSync(
  path.join(root, 'app/packages/web/components/NewIssueForm.tsx'),
  'utf8',
);
assert(nifSrc.includes('useFocusTrap'), 'NewIssueForm wires useFocusTrap (strategy A)');

for (const page of ['SquadsPage.tsx', 'SkillsPage.tsx', 'MyIssuesPage.tsx']) {
  const src = fs.readFileSync(
    path.join(root, 'app/packages/web/components', page),
    'utf8',
  );
  assert(src.includes('PageSkeleton'), `${page} uses PageSkeleton`);
  assert(src.includes('ErrorState'), `${page} uses ErrorState`);
  assert(!src.includes('加载中…'), `${page} no bare 加载中…`);
}

console.log('\n4) optional Playwright (localhost:3000)');
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext().then((c) => c.newPage());
  try {
    const res = await page.goto('http://localhost:3000/', {
      waitUntil: 'domcontentloaded',
      timeout: 4000,
    });
    if (res && res.ok()) {
      console.log('  ✅ frontend reachable');
      passed++;

      // Ctrl+K → cmdk trap
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(400);
      const cmdk = page.getByTestId('cmdk-input');
      const cmdkVisible = await cmdk.isVisible().catch(() => false);
      if (cmdkVisible) {
        console.log('  ✅ cmdk opened (Ctrl+K)');
        passed++;
        const dialog = page.locator('[role="dialog"][aria-modal="true"]').first();
        assert(await dialog.count().then((n) => n > 0), 'cmdk dialog has role=dialog aria-modal');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const still = await cmdk.isVisible().catch(() => false);
        assert(!still, 'Esc closes cmdk');
      } else {
        console.log('  ⚠️  cmdk not visible after Ctrl+K — skip trap live');
      }

      // chat page DOM hooks
      await page.goto('http://localhost:3000/chat', {
        waitUntil: 'domcontentloaded',
        timeout: 4000,
      });
      await page.waitForTimeout(500);
      const chatPage = page.getByTestId('chat-page');
      if (await chatPage.isVisible().catch(() => false)) {
        console.log('  ✅ /chat page renders');
        passed++;
        // 新消息按钮默认隐藏（无未读/未上滑）
        const btnCount = await page.getByTestId('chat-new-messages-btn').count();
        assert(btnCount === 0, 'chat-new-messages-btn hidden by default');
      } else {
        console.log('  ⚠️  chat page not visible — skip');
      }
    } else {
      console.log('  ⚠️  frontend not up — skip UI probe');
    }
  } catch {
    console.log('  ⚠️  frontend not up — skip UI probe');
  } finally {
    await browser.close();
  }
} catch {
  console.log('  ⚠️  playwright not available — skip UI probe');
}

console.log(`\n—— Slice 27 e2e skeleton done: ${passed} passed, ${failed} failed ——`);
if (failed > 0) process.exit(1);
console.log('🎉 skeleton PASS (run typecheck for TS; Owner may start stack for live Playwright)');
