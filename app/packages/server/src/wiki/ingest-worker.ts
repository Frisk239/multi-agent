// S08 Wiki ingest worker（spec §4.4，学 run-worker tick；ingest 单并发）
import {
  claimNextWikiIngestJob,
  completeWikiIngestJob,
  failWikiIngestJob,
  recoverStuckRunningJobs,
} from './ingest-queue.js';
import { ingestIssue } from './ingest.js';

let timer: ReturnType<typeof setInterval> | null = null;
// 内存单并发闸：避免上一个 execute 未结束时 tick 再 claim 下一单（LLM 刷爆）
let busy = false;

export function startWikiIngestWorker(): void {
  if (timer) return;
  const recovered = recoverStuckRunningJobs();
  if (recovered > 0) {
    console.log(`[wiki-ingest-worker] recovered ${recovered} stuck running job(s)`);
  }
  timer = setInterval(() => {
    void tick();
  }, 500);
}

export function wakeWikiIngestWorker(): void {
  void tick();
}

async function tick(): Promise<void> {
  if (busy) return;
  const job = claimNextWikiIngestJob();
  if (!job) return;
  busy = true;
  void execute(job.id, job.issueId).finally(() => {
    busy = false;
  });
}

async function execute(jobId: string, issueId: string): Promise<void> {
  try {
    await ingestIssue(issueId);
    completeWikiIngestJob(jobId);
  } catch (err) {
    console.error('[wiki-ingest-worker] job 失败:', jobId, err);
    failWikiIngestJob(jobId, String(err));
  }
}
