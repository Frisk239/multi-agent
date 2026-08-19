// run-control —— abort 注册表（学 multica daemon watchTaskCancellation）。
// 每个 run 的 AbortController 存内存 Map：cancel 时 abort → spawn-line 收到信号
// → kill 子进程树。run 终态后清理。
//
// G5-4 + G8-2 崩溃语义（钉死）：注册表纯内存，进程崩溃后全部条目丢失。重启处置：
//   - DB running + 无 abort 条目 → recoverOrphanedRunningRuns 读取持久 owner。
//     只有 PID + OS 启动指纹 + 安全进程组都复核一致时才请求 kill tree；否则
//     failed/unknown_external_execution 且绝不按 PID 盲杀。
//   - DB 已终态（cancelRunById 的 UPDATE 先于 abortRun 提交）→ 终态保持不动；
//     未杀掉的孤儿 CLI 子进程由 OS 接管，重启不会重新执行该 run
//   - graceful-shutdown 中断（abort 已发、DB 未终态化）→ 同上跑重启 orphan
// 本模块保持零依赖（不碰 DB）：它是「本进程是否有活 executor」的代理，
// 崩溃后恒为空正是收尸逻辑判定的依据。
const aborts = new Map<string, AbortController>();

export function registerRunAbort(runId: string): AbortSignal {
  // 同 id 二次 register 覆盖旧条目：旧 controller 不再受 abort 管理
  // （正常路径 run 终态后已 clear，不会二次注册同 id）
  const c = new AbortController();
  aborts.set(runId, c);
  return c.signal;
}

/** abort 并移除条目。幂等：未注册 / 已移除返回 false（调用方据此跳过重复处理）。 */
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
