// S08 Wiki ingest worker（spec §4.4，学 run-worker tick；ingest 单并发）
// Slice 47 / H2：tick 扫 running lease；启动 recover 只清孤儿锁
import {
  claimNextWikiIngestJob,
  completeWikiIngestJob,
  failWikiIngestJob,
  recoverStuckRunningJobs,
  requeueStaleRunningJobs,
} from './ingest-queue.js';
import { ingestIssue } from './ingest.js';
import { logger } from '../logger.js';
import {
  invokeWorkerTickSafely,
  markWorkerStarted,
  markWorkerStopped,
  noteWorkerFailure,
  trackWorkerTick,
} from '../process-health.js';

let timer: ReturnType<typeof setInterval> | null = null;
// 内存单并发闸：避免上一个 execute 未结束时 tick 再 claim 下一单（LLM 刷爆）
let busy = false;
let stopped = false;

function tickSafe(): void {
  invokeWorkerTickSafely(
    () => tick(),
    (err) => {
      logger.error({ err }, '[wiki-ingest-worker] tick failed');
    },
  );
}

export function startWikiIngestWorker(): void {
  if (timer) return;
  stopped = false;
  markWorkerStarted('wikiIngestWorker');
  // 启动：上一进程遗留 running 一律回 pending（不计 failCount）
  try {
    const recovered = recoverStuckRunningJobs();
    if (recovered > 0) {
      console.log(`[wiki-ingest-worker] recovered ${recovered} orphan running job(s) on start`);
    }
  } catch (err) {
    // 启动 recovery 不阻断后续 loop；下一个成功 tick 会自动清该失败状态。
    noteWorkerFailure('wikiIngestWorker', err);
    logger.error({ err }, '[wiki-ingest-worker] startup recovery failed');
  }
  timer = setInterval(tickSafe, 500);
}

/** Slice 23：关停时清 timer（在途 ingest best-effort 不强制 drain） */
export function stopWikiIngestWorker(): void {
  stopped = true;
  markWorkerStopped('wikiIngestWorker');
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function wakeWikiIngestWorker(): void {
  if (stopped) return;
  tickSafe();
}

async function tick(): Promise<void> {
  if (stopped) return;
  await trackWorkerTick('wikiIngestWorker', () => {
    // 运行中 lease：超时 running → fail 路径（pending+backoff 或 dead）；busy 时也扫
    const leased = requeueStaleRunningJobs();
    if (leased > 0) {
      console.log(`[wiki-ingest-worker] requeued ${leased} stale running job(s) by lease`);
    }
    if (busy) return;
    const job = claimNextWikiIngestJob();
    if (!job) return;
    busy = true;
    void execute(job.id, job.issueId).finally(() => {
      busy = false;
    });
  });
}

async function execute(jobId: string, issueId: string): Promise<void> {
  try {
    await ingestIssue(issueId);
    // complete/fail 均带 status=running 闸，lease 已 requeue 时 no-op
    completeWikiIngestJob(jobId);
  } catch (err) {
    console.error('[wiki-ingest-worker] job 失败:', jobId, err);
    failWikiIngestJob(jobId, String(err));
  }
}
