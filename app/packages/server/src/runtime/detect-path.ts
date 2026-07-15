import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// resolveCmd 对齐 multica 的 LookPath 发现（deep/multica.md §5）：
// 1) envKey 覆盖优先（CLAUDE_PATH / OPENCODE_PATH / CURSOR_PATH）
// 2) 否则 where(windows) / which(unix) 逐个解析候选命令名
export async function resolveCmd(
  envKey: string,
  candidates: string[],
): Promise<string | null> {
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    try {
      await access(fromEnv, constants.X_OK);
      return fromEnv;
    } catch {
      /* fallthrough */
    }
  }
  for (const c of candidates) {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(cmd, [c], { windowsHide: true });
      const line = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (line) return line;
    } catch {
      /* next */
    }
  }
  return null;
}

// versionOf 对齐 multica extractVersionLine：取 --version 第一行非空。
// 对齐 multica 的 8s detectVersionTimeout，避免 wedged CLI 卡死整个探测。
export async function versionOf(
  bin: string,
  args: string[] = ['--version'],
): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: 8000,
      windowsHide: true,
    });
    const t = (stdout || stderr).trim().split(/\r?\n/)[0];
    return t || null;
  } catch {
    return null;
  }
}
