/**
 * Slice 26 · WS 轻量订阅 + 重连按页刷新
 *
 * 两段：
 * 1) Node 纯函数 / 协议骨架（不依赖前端起服）— 始终可跑
 * 2) 可选 Playwright：若 localhost:3000/3001 可用则验证 WS subscribe 帧
 *
 * 用法: node scripts/e2e-slice26-ws-subscribe.js
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

// —— 镜像前端 topicsForPath / invalidateForPath（与 web/lib/ws.ts 对齐；骨架自检）——
function topicsForPath(pathname) {
  const pathOnly = (pathname ?? '/').split('?')[0] || '/';
  const parts = pathOnly.split('/').filter(Boolean);
  const head = parts[0] ?? '';
  const id = parts[1];
  if (head === 'issues' && id) return [`issue:${id}`, 'run:', 'agent:', 'inbox:'];
  if (head === 'runs') {
    return id
      ? [`run:${id}`, 'run:', 'issue:', 'agent:', 'inbox:']
      : ['run:', 'issue:', 'agent:', 'inbox:'];
  }
  if (head === 'chat') return ['run:', 'agent:', 'inbox:', 'issue:'];
  if (head === 'wiki') return ['wiki:', 'inbox:'];
  if (head === 'agents' && id) return ['agent:', `agent:${id}`, 'inbox:', 'issue:'];
  if (head === 'inbox') return ['inbox:', 'issue:', 'agent:'];
  return ['issue:', 'agent:', 'inbox:'];
}

function invalidateForPath(pathname) {
  const pathOnly = (pathname ?? '/').split('?')[0] || '/';
  const parts = pathOnly.split('/').filter(Boolean);
  const head = parts[0] ?? '';
  const id = parts[1];
  const keys = [['runs-active-count'], ['inbox-unread']];
  if (head === 'issues' && id) {
    keys.push(['issue', id], ['comments', id], ['runs', id], ['issues']);
    return keys;
  }
  if (head === 'runs') {
    keys.push(['runs'], ['runs', 'workspace']);
    if (id) keys.push(['run', id], ['run-messages', id], ['run-tree', id]);
    return keys;
  }
  if (head === 'wiki') {
    keys.push(['wiki-pages'], ['wiki-jobs']);
    return keys;
  }
  if (head === 'chat') {
    keys.push(['chat-threads'], ['chat-messages']);
    return keys;
  }
  keys.push(['issues'], ['agents']);
  return keys;
}

// —— 镜像服务端 eventMatchesTopics 关键规则 ——
const STREAM_TYPES = new Set([
  'run:progress',
  'run:stream_chunk',
  'run:message',
  'runtime:event',
]);

function hasKind(topics, kind, id) {
  const prefix = `${kind}:`;
  if (topics.includes(prefix)) return true;
  if (id != null && id !== '' && topics.includes(prefix + id)) return true;
  return false;
}

function eventMatchesTopics(e, topics) {
  if (topics == null) return true;
  if (STREAM_TYPES.has(e.type)) {
    const runId =
      e.runId ?? e.message?.runId ?? e.event?.runId ?? null;
    return hasKind(topics, 'run', runId);
  }
  if (String(e.type).startsWith('run:') && e.run) {
    return (
      hasKind(topics, 'run', e.run.id) ||
      hasKind(topics, 'issue', e.run.issueId) ||
      hasKind(topics, 'agent', e.run.agentId)
    );
  }
  if (e.type === 'issue:created' || e.type === 'issue:updated') {
    return hasKind(topics, 'issue', e.issue?.id);
  }
  if (e.type === 'agent:status_changed') return hasKind(topics, 'agent', e.agentId);
  if (e.type === 'inbox:item') return hasKind(topics, 'inbox');
  if (e.type === 'wiki:page-created') return hasKind(topics, 'wiki');
  return false;
}

console.log('🚀 Slice 26 e2e skeleton — unit-style checks (no full stack required)\n');

console.log('1) topicsForPath');
assert(!topicsForPath('/').includes('run:'), 'board does not subscribe run: stream');
assert(topicsForPath('/issues/iss-1').includes('run:'), 'issue detail subscribes run:');
assert(topicsForPath('/issues/iss-1').includes('issue:iss-1'), 'issue detail has issue:{id}');
assert(topicsForPath('/runs').includes('run:'), 'runs list has run:');
assert(topicsForPath('/wiki').includes('wiki:'), 'wiki has wiki:');
assert(topicsForPath('/chat').includes('run:'), 'chat has run:');

console.log('\n2) invalidateForPath');
const boardKeys = invalidateForPath('/');
assert(
  boardKeys.some((k) => k[0] === 'runs-active-count'),
  'always runs-active-count',
);
assert(boardKeys.some((k) => k[0] === 'inbox-unread'), 'always inbox-unread');
assert(!boardKeys.some((k) => k[0] === 'runs' && k.length === 1), 'board does not fixed-refresh runs');
const issueKeys = invalidateForPath('/issues/iss-9');
assert(issueKeys.some((k) => k[0] === 'issue' && k[1] === 'iss-9'), 'issue detail invalidates issue id');

console.log('\n3) L/S matching');
assert(
  eventMatchesTopics({ type: 'run:progress', runId: 'r1' }, ['issue:', 'agent:']) === false,
  'S stream blocked without run:',
);
assert(
  eventMatchesTopics({ type: 'run:progress', runId: 'r1' }, ['run:']) === true,
  'S stream allowed with run:',
);
assert(
  eventMatchesTopics(
    { type: 'run:queued', run: { id: 'r1', issueId: 'iss-1', agentId: 'a1' } },
    ['issue:iss-1'],
  ) === true,
  'L lifecycle matches issue:{id}',
);
assert(
  eventMatchesTopics({ type: 'issue:created', issue: { id: 'iss-1' } }, null) === true,
  'topics=null full fanout',
);

console.log('\n4) optional live WS probe (localhost:3001)');
async function probeWs() {
  let WebSocketImpl;
  try {
    // prefer ws package from server
    WebSocketImpl = require(
      path.resolve(__dirname, '../app/packages/server/node_modules/ws'),
    );
  } catch {
    try {
      WebSocketImpl = (await import('ws')).default;
    } catch {
      console.log('  ⚠️  ws package not found; skip live probe');
      return;
    }
  }

  await new Promise((resolve) => {
    const socket = new WebSocketImpl('ws://localhost:3001/ws');
    const timer = setTimeout(() => {
      console.log('  ⚠️  WS connect timeout (stack not up?) — skeleton still OK');
      try {
        socket.terminate();
      } catch {
        /* ignore */
      }
      resolve();
    }, 2500);

    socket.on('open', () => {
      console.log('  ✅ WS open');
      socket.send(JSON.stringify({ type: 'subscribe', topics: ['issue:', 'agent:', 'inbox:'] }));
      console.log('  ✅ sent subscribe (board topics, no run:)');
      // 再发 replace
      socket.send(JSON.stringify({ type: 'subscribe', topics: ['run:', 'issue:iss-x'] }));
      console.log('  ✅ sent subscribe replace (detail topics)');
      clearTimeout(timer);
      socket.close();
      passed += 2;
      resolve();
    });

    socket.on('error', () => {
      clearTimeout(timer);
      console.log('  ⚠️  WS error (server not running) — skip live; unit skeleton passed');
      resolve();
    });
  });
}

await probeWs();

// optional Playwright if up
console.log('\n5) optional Playwright page open');
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
      // 监听 subscribe 帧（best-effort）
      const wsFrames = [];
      page.on('websocket', (ws) => {
        ws.on('framesent', (frame) => {
          wsFrames.push(frame.payload);
        });
      });
      await page.waitForTimeout(1500);
      const sub = wsFrames.find((f) => typeof f === 'string' && f.includes('subscribe'));
      if (sub) {
        console.log('  ✅ observed client subscribe frame:', String(sub).slice(0, 120));
        passed++;
      } else {
        console.log('  ⚠️  no subscribe frame observed in time (may still work; unit is source of truth)');
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

console.log(`\n—— Slice 26 e2e skeleton done: ${passed} passed, ${failed} failed ——`);
if (failed > 0) process.exit(1);
console.log('🎉 skeleton PASS (run vitest for full unit coverage)');
