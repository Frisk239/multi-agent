/**
 * Slice 66：waiting_local_directory「已等待 Xs」文案。
 * 用 API `waitingLocalEnteredAt`（epoch ms），禁止用 createdAt 瞎猜。
 */

export function waitingElapsedMs(
  enteredAt: number | null | undefined,
  now = Date.now(),
): number | null {
  if (enteredAt == null || !Number.isFinite(enteredAt)) return null;
  return Math.max(0, now - enteredAt);
}

/** 例：`12s` / `2m 5s` / `1h 3m`；无时刻则 null */
export function formatWaitingElapsed(
  enteredAt: number | null | undefined,
  now = Date.now(),
): string | null {
  const ms = waitingElapsedMs(enteredAt, now);
  if (ms == null) return null;
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
}

/** UI 前缀文案：`已等待 12s`；无 enteredAt → null */
export function waitingElapsedLabel(
  enteredAt: number | null | undefined,
  now = Date.now(),
): string | null {
  const body = formatWaitingElapsed(enteredAt, now);
  return body == null ? null : `已等待 ${body}`;
}
