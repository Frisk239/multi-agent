// S08 CLI 入口：ma wiki <cmd>（spec §5，Agent-first JSON Envelope）
// bu03：ma issue create —— HTTP 调本地 server 建卡并 origin link
// 只 import wiki/queue 函数，不复制业务逻辑（B10）
import { readFileSync } from 'node:fs';
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
    // bu03 issue create flags（有值的都 skip）
    if (
      a === '--title' ||
      a === '--description' ||
      a === '--description-file' ||
      a === '--assignee-type' ||
      a === '--assignee-id' ||
      a === '--priority' ||
      a === '--origin-run' ||
      a === '--server'
    ) {
      i++;
      continue;
    }
    if (
      a.startsWith('--title=') ||
      a.startsWith('--description=') ||
      a.startsWith('--description-file=') ||
      a.startsWith('--assignee-type=') ||
      a.startsWith('--assignee-id=') ||
      a.startsWith('--priority=') ||
      a.startsWith('--origin-run=') ||
      a.startsWith('--server=')
    ) {
      continue;
    }
    out.push(a);
  }
  return out;
}

function statusFilter(args: string[]): string | undefined {
  const eq = args.find((a) => a.startsWith('--status='));
  return eq ? eq.slice('--status='.length) : undefined;
}

function flagValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('-')) {
    return args[i + 1];
  }
  return undefined;
}

async function handleIssueCreate(args: string[], wantText: boolean): Promise<void> {
  const title = flagValue(args, '--title');
  if (!title) emitErr('input.invalid', 'ma issue create 需要 --title', 5);

  let description = flagValue(args, '--description') ?? '';
  const descFile = flagValue(args, '--description-file');
  if (descFile) {
    try {
      description = readFileSync(descFile, 'utf8');
    } catch (e) {
      emitErr('input.invalid', `无法读取 description-file: ${String(e)}`, 5);
    }
  }

  const assigneeType = flagValue(args, '--assignee-type');
  const assigneeId = flagValue(args, '--assignee-id');
  if (!assigneeType || !assigneeId) {
    emitErr(
      'input.invalid',
      'ma issue create 需要 --assignee-type agent|squad 与 --assignee-id',
      5,
    );
  }
  if (assigneeType !== 'agent' && assigneeType !== 'squad') {
    emitErr('input.invalid', '--assignee-type 必须是 agent 或 squad', 5);
  }

  const priority = flagValue(args, '--priority') ?? 'medium';
  const originRun =
    flagValue(args, '--origin-run') ?? process.env.MA_RUN_ID ?? undefined;
  if (!originRun) {
    emitErr(
      'input.invalid',
      'ma issue create 需要 --origin-run 或环境变量 MA_RUN_ID',
      5,
    );
  }

  const server = (
    flagValue(args, '--server') ??
    process.env.MA_SERVER_URL ??
    'http://127.0.0.1:3001'
  ).replace(/\/$/, '');

  const body = {
    title,
    description: description || undefined,
    priority,
    assignee: { type: assigneeType, id: assigneeId },
    originType: 'quick_create' as const,
    originRunId: originRun,
  };

  let res: Response;
  try {
    res = await fetch(`${server}/api/issues`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    emitErr('server.transient', `无法连接 server ${server}: ${String(e)}`, 7);
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    emitErr('server.transient', `非 JSON 响应 HTTP ${res.status}: ${text.slice(0, 200)}`, 7);
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : text;
    emitErr('server.transient', `HTTP ${res.status}: ${msg}`, res.status === 400 ? 5 : 7);
  }

  if (wantText) {
    const issue = data as { identifier?: string; title?: string; id?: string };
    process.stdout.write(
      `Created ${issue.identifier ?? issue.id ?? '?'}: ${issue.title ?? title}\n`,
    );
    process.exit(0);
  }
  emitOk({ issue: data });
}

async function main(): Promise<void> {
  ensureWikiDir();
  // pnpm run ma -- wiki ... 会把单独的 `--` 传进 argv，需剥离
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const wantText = wantsText(args);
  const pos = positional(args);

  // bu03：ma issue create
  if (pos[0] === 'issue') {
    if (pos[1] === 'create') {
      await handleIssueCreate(args, wantText);
      return;
    }
    emitErr('input.invalid', '用法: ma issue create --title ... --assignee-type ... --assignee-id ... --origin-run ...', 5);
  }

  if (pos[0] !== 'wiki') {
    emitErr(
      'input.invalid',
      '用法: ma wiki <health|lint|query|pages|jobs|ingest> ... | ma issue create ...',
      5,
    );
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
