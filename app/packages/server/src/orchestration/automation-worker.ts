import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { automationRules } from '../db/schema.js';
import { logger } from '../logger.js';
import { computeDuePlannedAt, dispatchAutomationRule } from './automation-dispatch.js';

let timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  const now = Date.now();
  const rules = db
    .select()
    .from(automationRules)
    .where(eq(automationRules.enabled, 1))
    .all();
  for (const r of rules) {
    const due = computeDuePlannedAt(r, now);
    if (due == null) continue;
    try {
      await dispatchAutomationRule(r.id, due, 'schedule');
    } catch (e) {
      logger.error({ runId: r.id, err: e instanceof Error ? e.message : String(e) }, '[automation] dispatch failed');
    }
  }
}

function tickSafe() {
  tick().catch((e) => {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, '[automation] tick failed');
  });
}

/** 30s tick + 启动立即 tick 一次；仅 enabled 规则。disabled 仍可 run-now。 */
export function startAutomationWorker(): void {
  if (timer) return;
  tickSafe();
  timer = setInterval(() => {
    void tick();
  }, 30_000);
  // 不阻止进程退出
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    (timer as NodeJS.Timeout).unref?.();
  }
}

export function stopAutomationWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
