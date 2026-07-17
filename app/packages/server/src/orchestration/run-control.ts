// run-control —— abort 注册表（学 multica daemon watchTaskCancellation）。
// 每个 run 的 AbortController 存内存 Map：cancel 时 abort → spawn-line 收到信号
// → kill 子进程树。run 终态后清理。
const aborts = new Map<string, AbortController>();

export function registerRunAbort(runId: string): AbortSignal {
  const c = new AbortController();
  aborts.set(runId, c);
  return c.signal;
}

export function abortRun(runId: string): boolean {
  const c = aborts.get(runId);
  if (!c) return false;
  c.abort();
  aborts.delete(runId);
  return true;
}

export function clearRunAbort(runId: string): void {
  aborts.delete(runId);
}

// bu01：orphan 收尸 / 调试用 —— 本进程是否仍持有该 run 的 AbortController
export function hasRunAbort(runId: string): boolean {
  return aborts.has(runId);
}

export function listActiveRunIds(): string[] {
  return [...aborts.keys()];
}
