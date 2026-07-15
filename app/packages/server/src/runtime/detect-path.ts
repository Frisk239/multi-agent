import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Windows 可执行后缀（用于从 where 多行输出里挑真正能 spawn 的）。
// npm 全局装的 CLI 在 Windows 产出三个 shim：<name>(unix 脚本)/<name>.cmd/<name>.ps1，
// 其中无扩展名的 unix 脚本不能被 Node spawn 直接执行，必须取 .cmd。
const WIN_EXE = ['.exe', '.cmd', '.bat'];

function isWindowsExecutable(p: string): boolean {
  return /\.(exe|cmd|bat)$/i.test(p);
}

// resolveCmd 对齐 multica 的 LookPath 发现（deep/multica.md §5）：
// 1) envKey 覆盖优先（CLAUDE_PATH / OPENCODE_PATH / CURSOR_PATH）
// 2) 否则 where(windows) / which(unix) 逐个解析候选命令名
// Windows 坑：where 一个命令名可能返回多行（无扩展名 unix shim + .cmd + .ps1），
// 必须优先取 .exe/.cmd/.bat 才能被 spawn 执行（对齐 multica 处理 npm shim 的需求）。
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
      const lines = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;
      if (process.platform === 'win32') {
        // 优先可执行后缀，避免取到无扩展名 unix shim（spawn 会 ENOENT）
        const exe = lines.find(isWindowsExecutable);
        return exe ?? lines[0];
      }
      return lines[0];
    } catch {
      /* next */
    }
  }
  return null;
}

// versionOf 对齐 multica extractVersionLine：取 --version 第一行非空。
// 对齐 multica 的 detectVersionTimeout，避免 wedged CLI 卡死整个探测。
// Windows 坑：.cmd/.bat shim 或无扩展名脚本需 shell:true 才能 spawn。
export async function versionOf(
  bin: string,
  args: string[] = ['--version'],
): Promise<string | null> {
  const needShell =
    process.platform === 'win32' && !/\.exe$/i.test(bin);
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: 8000,
      windowsHide: true,
      shell: needShell,
    });
    const t = (stdout || stderr).trim().split(/\r?\n/)[0];
    return t || null;
  } catch {
    return null;
  }
}
