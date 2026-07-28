// Slice 75：跨平台进程树 kill + 在途子进程登记（关停 residual 强杀用）。
// 不引入 ps-tree；Windows 用 taskkill /T /F，POSIX 用 SIGTERM（可选进程组）。
import { spawn } from 'node:child_process';

export type KillProcessTreeResult = {
  pid: number;
  platform: NodeJS.Platform;
  attempted: boolean;
  /** Windows 时是否调度了 taskkill */
  taskkill: boolean;
};

/** 在途 CLI 子进程 pid（spawn-line 登记；close 后注销） */
const trackedChildPids = new Map<number, number>(); // pid -> registeredAt

export function trackChildPid(pid: number, at = Date.now()): void {
  if (!Number.isFinite(pid) || pid <= 0) return;
  trackedChildPids.set(pid, at);
}

export function untrackChildPid(pid: number): void {
  trackedChildPids.delete(pid);
}

export function listTrackedChildPids(): number[] {
  return [...trackedChildPids.keys()];
}

export function trackedChildCount(): number {
  return trackedChildPids.size;
}

/** 测试用 */
export function __resetTrackedChildPidsForTests(): void {
  trackedChildPids.clear();
}

/**
 * 杀 pid 及其（尽力而为）子树。
 * - win32: child.kill 后 taskkill /T /F
 * - 其他: SIGTERM；若可对进程组发信号则再试 -pid
 */
export function killProcessTree(
  pid: number,
  opts?: {
    spawnTaskkill?: typeof spawn;
    kill?: typeof process.kill;
    platform?: NodeJS.Platform;
  },
): KillProcessTreeResult {
  const platform = opts?.platform ?? process.platform;
  const kill = opts?.kill ?? process.kill.bind(process);
  const spawnTaskkill = opts?.spawnTaskkill ?? spawn;

  if (!Number.isFinite(pid) || pid <= 0) {
    return { pid, platform, attempted: false, taskkill: false };
  }

  let taskkill = false;
  try {
    try {
      kill(pid, 'SIGTERM');
    } catch {
      /* 已退出 */
    }

    if (platform === 'win32') {
      taskkill = true;
      try {
        spawnTaskkill('taskkill', ['/pid', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {
        /* ignore */
      }
    } else {
      // 进程组（若 spawn detached / setsid）；失败则忽略
      try {
        kill(-pid, 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  } catch {
    return { pid, platform, attempted: false, taskkill };
  }

  return { pid, platform, attempted: true, taskkill };
}

export type KillAllTrackedTreesReport = {
  attempted: number;
  pids: number[];
  results: KillProcessTreeResult[];
};

/** 对当前登记的全部子进程做 tree kill，并清空登记表 */
export function killAllTrackedTrees(
  opts?: Parameters<typeof killProcessTree>[1],
): KillAllTrackedTreesReport {
  const pids = listTrackedChildPids();
  const results: KillProcessTreeResult[] = [];
  for (const pid of pids) {
    results.push(killProcessTree(pid, opts));
    untrackChildPid(pid);
  }
  return { attempted: pids.length, pids, results };
}
