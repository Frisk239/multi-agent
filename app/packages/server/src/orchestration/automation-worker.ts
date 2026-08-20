import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { automationRules } from '../db/schema.js';
import { logger } from '../logger.js';
import { processScheduledAutomationRule } from './automation-dispatch.js';
import {
  invokeWorkerTickSafely,
  markWorkerStarted,
  markWorkerStopped,
  trackWorkerTick,
} from '../process-health.js';

let timer: ReturnType<typeof setInterval> | null = null;

/** Exported for fixed-clock SQLite coverage; the timer wrapper remains the only production scheduler. */
export async function tickAutomationWorker(now: number = Date.now()): Promise<void> {
  const rules = db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.enabled, 1), isNull(automationRules.archivedAt)))
    .all();
  for (const rule of rules) {
    try {
      await processScheduledAutomationRule(rule, now);
    } catch (e) {
      logger.error(
        { runId: rule.id, err: e instanceof Error ? e.message : String(e) },
        '[automation] dispatch failed',
      );
    }
  }
}

async function tick(): Promise<void> {
  await trackWorkerTick('automationWorker', async () => {
    await tickAutomationWorker();
  });
}

function tickSafe(): void {
  invokeWorkerTickSafely(
    () => tick(),
    (err) => {
      logger.error({ err }, '[automation] tick failed');
    },
  );
}

/** 30s tick + 启动立即 tick 一次；仅 enabled 规则。disabled 仍可 run-now。 */
export function startAutomationWorker(): void {
  if (timer) return;
  markWorkerStarted('automationWorker');
  tickSafe();
  timer = setInterval(tickSafe, 30_000);
  // 不阻止进程退出
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    (timer as NodeJS.Timeout).unref?.();
  }
}

export function stopAutomationWorker(): void {
  markWorkerStopped('automationWorker');
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
