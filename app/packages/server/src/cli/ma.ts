// S08 CLI 入口：ma wiki <cmd>（spec §5，Agent-first JSON Envelope）
// 只 import wiki/queue 函数，不复制业务逻辑（B10）
import { ensureWikiDir, listWikiPages } from '../wiki/store.js';
import { checkHealth } from '../wiki/health.js';
import { checkLint } from '../wiki/lint.js';
import { queryWiki } from '../wiki/query.js';
import {
  enqueueWikiIngest,
  listWikiIngestJobs,
  retryWikiIngestJob,
  toWikiIngestJob,
  getWikiIngestJob,
} from '../wiki/ingest-queue.js';
// 注意：CLI 是独立进程，不 startWikiIngestWorker；enqueue/retry 后勿 wake
// （wake 会 claim 后被 process.exit 打断，job 卡在 running）。
// 默认依赖已启动的 server worker 轮询 claim；--sync 同步直跑 ingestIssue。
import { ingestIssue } from '../wiki/ingest.js';
import { emitOk, emitErr } from './envelope.js';

function wantsText(args: string[]): boolean {
  const eq = args.find((a) => a.startsWith('--format='));
  if (eq) return eq.slice('--format='.length) === 'text';
  const i = args.indexOf('--format');
  if (i >= 0 && args[i + 1] === 'text') return true;
  // 默认：TTY→text，pipe→json（spec §5.4）
  if (!args.some((a) => a === '--format' || a.startsWith('--format='))) {
    return Boolean(process.stdout.isTTY);
  }
  return false;
}

/** 去掉 flag，便于取位置参数 */
function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--format') {
      i++; // skip value
      continue;
    }
    if (a.startsWith('--format=')) continue;
    if (a === '--sync') continue;
    if (a.startsWith('--status=')) continue;
    out.push(a);
  }
  return out;
}

function statusFilter(args: string[]): string | undefined {
  const eq = args.find((a) => a.startsWith('--status='));
  return eq ? eq.slice('--status='.length) : undefined;
}

async function main(): Promise<void> {
  ensureWikiDir();
  // pnpm run ma -- wiki ... 会把单独的 `--` 传进 argv，需剥离
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const wantText = wantsText(args);
  const pos = positional(args);

  if (pos[0] !== 'wiki') {
    emitErr('input.invalid', '用法: ma wiki <health|lint|query|pages|jobs|ingest> ...', 5);
  }

  const cmd = pos[1];
  try {
    if (cmd === 'health') {
      const data = checkHealth();
      if (wantText) {
        process.stdout.write(
          `pages=${data.total} orphans=${data.orphans.length} broken=${data.brokenLinks.length} stubs=${data.stubs.length}\n`,
        );
        process.exit(0);
      }
      emitOk(data, { count: data.total });
    }

    if (cmd === 'lint') {
      const data = await checkLint();
      if (wantText) {
        process.stdout.write(data.report + '\n');
        process.exit(0);
      }
      emitOk(data);
    }

    if (cmd === 'query') {
      const q = pos[2];
      if (!q) emitErr('input.invalid', 'ma wiki query "<question>"', 5);
      const data = await queryWiki(q);
      if (wantText) {
        process.stdout.write(data.answer + '\n');
        process.exit(0);
      }
      emitOk(data);
    }

    if (cmd === 'pages') {
      const data = listWikiPages();
      if (wantText) {
        process.stdout.write(data.map((p) => `${p.slug}\t${p.title}`).join('\n') + (data.length ? '\n' : ''));
        process.exit(0);
      }
      emitOk(data, { count: data.length });
    }

    if (cmd === 'jobs') {
      if (pos[2] === 'retry') {
        const id = pos[3];
        if (!id) emitErr('input.invalid', 'ma wiki jobs retry <id>', 5);
        const ok = retryWikiIngestJob(id);
        if (!ok) emitErr('input.invalid', '仅 dead job 可 retry', 5);
        const row = getWikiIngestJob(id);
        if (wantText) {
          process.stdout.write(`retried ${id} status=${row?.status ?? '?'}\n`);
          process.exit(0);
        }
        emitOk(row ? toWikiIngestJob(row) : null);
      }
      const status = statusFilter(args);
      const rows = listWikiIngestJobs(status).map(toWikiIngestJob);
      if (wantText) {
        for (const j of rows) {
          process.stdout.write(
            `${j.id}\t${j.status}\tissue=${j.issueId}\tfail=${j.failCount}${j.lastError ? `\t${j.lastError}` : ''}\n`,
          );
        }
        process.exit(0);
      }
      emitOk(rows, { count: rows.length });
    }

    if (cmd === 'ingest') {
      const issueId = pos[2];
      if (!issueId) emitErr('input.invalid', 'ma wiki ingest <issueId> [--sync]', 5);
      if (args.includes('--sync')) {
        await ingestIssue(issueId);
        if (wantText) {
          process.stdout.write(`ingest sync ok issue=${issueId}\n`);
          process.exit(0);
        }
        emitOk({ issueId, mode: 'sync' });
      }
      const jobId = enqueueWikiIngest(issueId);
      if (wantText) {
        process.stdout.write(`enqueued issue=${issueId} jobId=${jobId ?? 'null(dedup)'}\n`);
        process.exit(0);
      }
      emitOk({ issueId, jobId, mode: 'enqueue' });
    }

    emitErr('input.invalid', `未知命令: ${cmd ?? '(missing)'}`, 5);
  } catch (e) {
    const msg = String(e);
    if (msg.includes('不存在')) emitErr('resource.not_found', msg, 4);
    if (msg.includes('WIKI_LLM_API_KEY') || msg.includes('未配置')) {
      emitErr('input.invalid', msg, 5);
    }
    emitErr('server.transient', msg, 7);
  }
}

void main();
