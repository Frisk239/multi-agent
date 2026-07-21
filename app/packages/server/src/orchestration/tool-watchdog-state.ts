// C2：进程内 tool in-flight 深度（学 Multica AgentToolWatchdog 语义）。
// 崩溃后 orphan recover 收尸，无需跨进程持久化。

export type ToolInflightState = {
  depth: number;
  lastToolName: string | null;
};

const byRun = new Map<string, ToolInflightState>();

export function noteToolStart(runId: string, name?: string): void {
  const cur = byRun.get(runId) ?? { depth: 0, lastToolName: null };
  cur.depth += 1;
  if (name?.trim()) cur.lastToolName = name.trim();
  byRun.set(runId, cur);
}

export function noteToolEnd(runId: string, name?: string): void {
  const cur = byRun.get(runId);
  if (!cur) return;
  cur.depth = Math.max(0, cur.depth - 1);
  if (name?.trim()) cur.lastToolName = name.trim();
  if (cur.depth === 0) {
    byRun.delete(runId);
  } else {
    byRun.set(runId, cur);
  }
}

export function getToolInflight(runId: string): ToolInflightState {
  return byRun.get(runId) ?? { depth: 0, lastToolName: null };
}

export function clearToolInflight(runId: string): void {
  byRun.delete(runId);
}
