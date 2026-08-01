/**
 * P2-4 自动改派 e2e ——「本地运行时连接不上」CLI 未安装形态（真实链路）
 *
 * 链路：独立 DB（migrate + seed）→ 更新 agent（agt-research 配 fallback
 * agt-lead；agt-lead 换 claude-code runtime）→ 起独立 server（env 强制
 * opencode CLI 不可达：OPENCODE_PATH 指向不存在路径 + SHELL='' 禁登录 shell
 * 兜底 + PATH 最小化）→ POST 评论（无 mention）到 assignee=agt-research 的
 * issue → enqueue → run-worker claim → execute 探测失败（'opencode CLI 未安装'）
 * → failRun（classify 归 exec_error）→ P2-4 触发面修正：连接不上类首次失败
 * 即改派 → 断言：改派子 run（escalated_from_run_id）/ activity run_escalated /
 * inbox escalate_fallback / 原 run error 注明「已自动改派给」。
 *
 * 说明：
 * - MA_ENQUEUE_ALLOW_NOT_READY=1（代码库自带的本地排障旁路）：enqueue 硬闸
 *   在 runtime_missing 时会直接 skip 不建 run——而本场景正是「运行时不可达」，
 *   必须旁路闸门才能让 run 进入队列走到 execute 失败 → 改派。
 * - 不 mock 任何东西：真 server、真 worker、真 execute 探测、真 failRun。
 *
 * 运行（自起独立 DB + server，端口 3101）：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-escalate-fallback.mts
 *
 * 对已起的 server（自行准备 DB 与 env）：
 *   SERVER=http://127.0.0.1:3001 E2E_DB=/abs/path/e2e-p24.db pnpm exec tsx scripts/e2e-escalate-fallback.mts
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');

const EXTERNAL_SERVER = process.env.SERVER ?? '';
const SERVER = EXTERNAL_SERVER || 'http://127.0.0.1:3101';
const PORT = '3101';
const DB_NAME = process.env.E2E_DB ?? 'e2e-p24.db';
const DB_PATH = join(SERVER_DIR, DB_NAME);
const LOG_DIR = join(__dirname, '../../../.progress/logs');

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
interface CheckRow { id: string; status: Status; note: string }
const results: CheckRow[] = [];

function record(id: string, ok: boolean, note: string): void {
  results.push({ id, status: ok ? 'PASS' : 'FAIL', note });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id} — ${note}`);
}
function warn(id: string, note: string): void {
  results.push({ id, status: 'WARN', note });
  console.log(`  [WARN] ${id} — ${note}`);
}
function skip(id: string, note: string): void {
  results.push({ id, status: 'SKIP', note });
  console.log(`  [SKIP] ${id} — ${note}`);
}

const nodeTsx = (script: string) =>
  spawnSync(process.execPath, ['--import', 'tsx', script], {
    cwd: SERVER_DIR,
    env: { ...process.env, DB_PATH },
    windowsHide: true,
    encoding: 'utf8',
    timeout: 120_000,
  });

function prepareDb(): boolean {
  console.log('## db prep');
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`, `${DB_PATH}-journal`]) {
    if (existsSync(f)) rmSync(f, { force: true });
  }
  const migrate = nodeTsx('src/db/migrate.ts');
  if (migrate.status !== 0) {
    record('db-migrate', false, `${migrate.status}: ${(migrate.stderr || migrate.stdout).slice(0, 400)}`);
    return false;
  }
  const seed = nodeTsx('src/db/seed.ts');
  if (seed.status !== 0) {
    record('db-seed', false, `${seed.status}: ${(seed.stderr || seed.stdout).slice(0, 400)}`);
    return false;
  }
  record('db-migrate', true, `fresh DB ${DB_NAME}`);
  record('db-seed', true, 'seed ok');

  // seed 后更新：agt-research（FRI-10 assignee）配 fallback；agt-lead 换 runtime
  const db = new Database(DB_PATH);
  try {
    db.prepare("UPDATE agent SET fallback_agent_id = 'agt-lead' WHERE id = 'agt-research'").run();
    db.prepare("UPDATE agent SET runtime = 'claude-code' WHERE id = 'agt-lead'").run();
  } finally {
    db.close();
  }
  record('db-update', true, "agt-research.fallback_agent_id=agt-lead · agt-lead.runtime=claude-code");
  return true;
}

function minimalPath(): string {
  return process.platform === 'win32' ? 'C:\\Windows\\System32;C:\\Windows' : '/usr/bin:/bin';
}

let serverProc: ReturnType<typeof spawn> | null = null;
let serverLogs = '';

function startServer(): Promise<boolean> {
  console.log('## server spawn');
  return new Promise((resolvePromise) => {
    const env = {
      ...process.env,
      DB_PATH,
      PORT,
      HOST: '127.0.0.1',
      // 强制 CLI 不可达：OPENCODE_PATH 指向不存在路径（access X_OK 失败 →
      // 探测链继续）→ where opencode 在最小 PATH 下找不到 → SHELL='' 禁登录
      // shell 兜底 → detect 返回未安装 → execute 报「opencode CLI 未安装」
      OPENCODE_PATH: join(SERVER_DIR, 'e2e-no-such-opencode.exe'),
      SHELL: '',
      PATH: minimalPath(),
      MA_ENQUEUE_ALLOW_NOT_READY: '1',
    };
    serverProc = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: SERVER_DIR,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stdout?.on('data', (d: Buffer) => { serverLogs += d.toString(); });
    serverProc.stderr?.on('data', (d: Buffer) => { serverLogs += d.toString(); });
    serverProc.on('exit', (code, sig) => {
      serverProc = null;
      console.log(`  [server] exited code=${code} sig=${sig}`);
    });

    const deadline = Date.now() + 40_000;
    const poll = async (): Promise<void> => {
      if (Date.now() > deadline) {
        record('server-health', false, `server 40s 内未就绪。logs:\n${serverLogs.slice(-800)}`);
        resolvePromise(false);
        return;
      }
      try {
        const res = await fetch(`${SERVER}/healthz`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          record('server-health', true, `server up at ${SERVER}`);
          resolvePromise(true);
          return;
        }
      } catch {
        /* retry */
      }
      setTimeout(() => void poll(), 500);
    };
    void poll();
  });
}

async function stopServer(): Promise<void> {
  if (!serverProc) return;
  const p = serverProc;
  await new Promise<void>((resolvePromise) => {
    const t = setTimeout(() => {
      try { p.kill('SIGKILL'); } catch { /* ignore */ }
      resolvePromise();
    }, 10_000);
    p.once('exit', () => { clearTimeout(t); resolvePromise(); });
    try { p.kill('SIGTERM'); } catch { /* ignore */ }
  });
  serverProc = null;
}

type RunRow = {
  id: string; status: string; agent_id: string; runtime: string;
  error: string | null; failure_reason: string | null;
  escalated_from_run_id: string | null; attempt: number; max_attempts: number;
};

async function waitForRun(
  db: Database.Database,
  predicate: (rows: RunRow[]) => RunRow | undefined,
  timeoutMs: number,
  what: string,
): Promise<RunRow | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = db.prepare(
      `SELECT id, status, agent_id, runtime, error, failure_reason,
              escalated_from_run_id, attempt, max_attempts
       FROM agent_run WHERE issue_id = ? ORDER BY created_at ASC`,
    ).all(issueId) as RunRow[];
    const hit = predicate(rows);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`  [poll] 超时未等到: ${what}`);
  return undefined;
}

let issueId: string;

async function main(): Promise<void> {
  console.log('==== e2e-escalate-fallback ====');

  if (!EXTERNAL_SERVER) {
    if (!prepareDb()) return finish();
    if (!(await startServer())) return finish();
  } else {
    warn('external-server', `SERVER=${SERVER} 由外部提供，跳过 DB prep + server 起停（自行保证 DB 已按脚本注释准备）`);
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const issue = db.prepare("SELECT id FROM issue WHERE identifier = 'FRI-10'").get() as { id: string } | undefined;
    if (!issue) { record('issue-lookup', false, 'FRI-10 不存在'); return; }
    issueId = issue.id;

    // —— 流程：POST 评论（无 mention）→ assignee=agt-research → enqueue ——
    console.log('## flow');
    const postRes = await fetch(`${SERVER}/api/issues/${issueId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: `e2e P2-4 fallback escalate ${Date.now()}` }),
    });
    if (postRes.status !== 201) {
      record('comment-post', false, `status=${postRes.status}: ${await postRes.text()}`);
      return;
    }
    const postJson: any = await postRes.json();
    const dispatch = postJson.dispatches?.[0];
    const queuedRunId = dispatch?.runId ?? null;
    record(
      'comment-enqueue',
      dispatch?.source === 'assignee' && dispatch?.targetId === 'agt-research' && !!queuedRunId,
      `dispatches=${JSON.stringify(postJson.dispatches)}`,
    );

    // —— 断言 1：原 run 失败 + error 注明「已自动改派给」 ——
    const parent = await waitForRun(
      db,
      (rows) => rows.find((r) => r.status === 'failed' && (r.error ?? '').includes('opencode CLI 未安装')),
      45_000,
      'failed parent run',
    );
    if (!parent) {
      record('parent-run-failed', false, '未等到 failed run（error 含 opencode CLI 未安装）');
      return;
    }
    const hasEscalateNote = (parent.error ?? '').includes('已自动改派给');
    record(
      'parent-run-failed',
      true,
      `run=${parent.id.slice(0, 8)} reason=${parent.failure_reason} error=${(parent.error ?? '').replace(/\n/g, ' ⏎ ')}`,
    );
    record('parent-error-annotated', hasEscalateNote, `含「已自动改派给」: ${hasEscalateNote}`);

    // —— 断言 2：改派子 run（换 agent/runtime、追溯、attempt=1）。
    // 注意：e2e server 的 worker 会立即 claim 改派子 run 并执行——fallback
    // 的 claude-code CLI 同样不可达，子 run 可能已 failed（深度 1 防递归，
    // 子 run 不会再改派）。因此不断言子 run 停留在 queued，只断言改派事实。
    const child = await waitForRun(
      db,
      (rows) => rows.find((r) => r.escalated_from_run_id === parent.id),
      15_000,
      'escalated child run',
    );
    const childOk =
      !!child &&
      child.agent_id === 'agt-lead' &&
      child.runtime === 'claude-code' &&
      child.attempt === 1;
    record(
      'escalated-child',
      !!childOk,
      child
        ? `child=${child.id.slice(0, 8)} agent=${child.agent_id} runtime=${child.runtime} status=${child.status} attempt=${child.attempt} escalatedFrom=${child.escalated_from_run_id}`
        : '未找到 escalated_from_run_id 子 run',
    );

    // —— 断言 2b：深度 1 防递归——子 run 不再产生改派（fallback 也连不上时
    // 不会无限级联），且整条链路只有一次 run_escalated ——
    if (child) {
      await new Promise((r) => setTimeout(r, 800));
      const recascade = db.prepare(
        'SELECT id FROM agent_run WHERE escalated_from_run_id = ? LIMIT 1',
      ).get(child.id);
      const escCount = (db.prepare(
        "SELECT COUNT(*) AS n FROM activity_log WHERE event_type = 'run_escalated' AND issue_id = ?",
      ).get(issueId) as { n: number }).n;
      record(
        'no-recascade-depth1',
        !recascade && escCount === 1,
        recascade ? `发现递归改派: ${recascade.id}` : `无递归改派；run_escalated 次数=${escCount}`,
      );
    }

    // —— 断言 3：activity run_escalated ——
    await new Promise((r) => setTimeout(r, 800));
    const act = db.prepare(
      `SELECT event_type, payload FROM activity_log WHERE issue_id = ? AND event_type = 'run_escalated' ORDER BY created_at DESC LIMIT 1`,
    ).get(issueId) as { event_type: string; payload: string | null } | undefined;
    const actOk = !!act && (act.payload ?? '').includes(parent.id) && (act.payload ?? '').includes('agt-lead');
    record('activity-run-escalated', !!actOk, act ? `payload=${act.payload}` : '未找到 run_escalated activity');

    // —— 断言 4：inbox escalate_fallback ——
    const inbox = db.prepare(
      `SELECT dedupe_key, title FROM inbox_item WHERE dedupe_key = ? LIMIT 1`,
    ).get(`escalate_fallback:${parent.id}`) as { dedupe_key: string; title: string } | undefined;
    const inboxOk = !!inbox && inbox.title.includes('已自动转给');
    record('inbox-escalate-fallback', !!inboxOk, inbox ? `title=${inbox.title}` : '未找到 escalate_fallback inbox 条目');

    if (!queuedRunId) warn('runid-from-response', '评论响应无 runId，改用 DB 侧断言');
  } finally {
    db.close();
  }
  finish();
}

function finish(): void {
  void stopServer().then(() => {
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\n==== e2e-escalate-fallback: ${pass} PASS / ${fail} FAIL / ${results.length} total ====`);
    try {
      mkdirSync(LOG_DIR, { recursive: true });
      const logPath = join(LOG_DIR, 'e2e-escalate-fallback.log');
      writeFileSync(
        logPath,
        `${new Date().toISOString()}\n${results.map((r) => `[${r.status}] ${r.id} — ${r.note}`).join('\n')}\n`,
      );
      console.log(`log → ${logPath}`);
    } catch {
      /* 日志目录不可写不阻塞结论 */
    }
    process.exit(fail > 0 ? 1 : 0);
  });
}

main().catch((e) => {
  console.error('e2e crash:', e);
  void stopServer().then(() => process.exit(1));
});
