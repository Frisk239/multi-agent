import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Windows 可执行后缀（用于从 where 多行输出里挑真正能 spawn 的）。
// npm 全局装的 CLI 在 Windows 产出三个 shim：<name>(unix 脚本)/<name>.cmd/<name>.ps1，
// 其中无扩展名的 unix 脚本不能被 Node spawn 直接执行，必须取 .cmd。
const WIN_EXE = ['.exe', '.cmd', '.bat'];

// 登录 shell 探测超时，对齐下方 versionOf 的 8000ms：wedged 的 rc 文件
// （nvm/direnv/starship 之类）不应卡死整个探测链。
const LOGIN_SHELL_TIMEOUT = 8000;

// 允许用 -ilc 调用的 shell 白名单，照 multica supportedLoginShells 口径：
// 脚本只依赖 POSIX `command -v` + sh 语法。fish 用 `command -s`/switch、语法
// 不兼容（multica 同样明确排除），所以不在此列。Git Bash 的 $SHELL=/usr/bin/bash
// basename 为 bash，能命中。
const SUPPORTED_LOGIN_SHELLS = new Set(['bash', 'zsh', 'sh', 'dash', 'ksh']);

// 命令名安全校验，照 multica isSafeAgentName：只允许 [A-Za-z0-9._-]。
// 候选名来自 registry 静态配置（claude/cursor-agent/...），此处是防未来漂移的
// 纵深防御——名字会被内联进 shell 脚本，绝不接受外部输入。
const SAFE_CMD_NAME = /^[A-Za-z0-9._-]+$/;

function isWindowsExecutable(p: string): boolean {
  return /\.(exe|cmd|bat)$/i.test(p);
}

// 返回可 spawn 的登录 shell 路径；$SHELL 缺失 / 非白名单 / 找不到 → null。
// Windows 降级口径：$SHELL 为空或 basename 不在白名单直接返回 null（不折腾 cmd）；
// 但 $SHELL 可能是 MSYS 路径（/usr/bin/bash），Node 的 Windows 进程 spawn 不了，
// 于是经 `where` 找同名可执行（Git Bash 启动的子进程 PATH 自带 Git 的 bin 目录）。
async function resolveLoginShell(): Promise<string | null> {
  const shell = process.env.SHELL?.trim();
  if (!shell) return null;
  let base = basename(shell);
  if (process.platform === 'win32') base = base.replace(/\.exe$/i, '');
  if (!SUPPORTED_LOGIN_SHELLS.has(base)) return null;
  try {
    await access(shell, constants.X_OK);
    return shell;
  } catch {
    /* fallthrough */
  }
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where', [base], { windowsHide: true });
      const p = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      if (p) {
        try {
          await access(p, constants.X_OK);
          return p;
        } catch {
          /* fallthrough */
        }
      }
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

// buildLoginShellResolveScript 照 multica buildLoginShellResolveScript 的语义：
// -il 同时读 ~/.bashrc 与 ~/.bash_profile（真实用户两边都可能写 PATH）；
// unalias/unset -f 必须保留：-i 会让别名/函数遮蔽 PATH 里的真实命令
// （实测 Git Bash 有 `alias node='winpty node.exe'`，#2512 同款），不先清理的话
// `command -v` 会打印别名定义而非路径，被下面的绝对路径校验丢弃；
// `cd dirname && pwd -P` 在 shell 还活着时把 fnm/nvm multishell 等符号链接前缀
// 折叠成稳定路径（这些目录在 shell 退出后即消失）。
// 名字均已过 SAFE_CMD_NAME 校验，直接内联进 for 循环是安全的。
function buildLoginShellResolveScript(names: string[]): string {
  const lines = [
    `for n in ${names.join(' ')}; do`,
    `  unalias "$n" 2>/dev/null`,
    `  unset -f "$n" 2>/dev/null`,
    `  p=$(command -v "$n" 2>/dev/null) || continue`,
    `  [ -n "$p" ] || continue`,
    `  case "$p" in /*) ;; *) continue ;; esac`,
    `  d=$(dirname "$p") && f=$(basename "$p") && c=$(cd "$d" 2>/dev/null && pwd -P) || continue`,
    `  printf '%s\\t%s\\n' "$n" "$c/$f"`,
    `done`,
  ];
  return lines.join('\n');
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

// win32 下把 MSYS 路径（/c/Users/x/...）转成 Node 能 access/spawn 的 C:/Users/x/...；
// /usr/... 这类无盘符的 MSYS 路径转不了，保持原样交给 access 判定（会失败）。
function toSpawnablePath(p: string): string {
  if (process.platform !== 'win32') return p;
  const m = /^\/[a-zA-Z]\//.exec(p);
  if (m) return `${m[0][1].toUpperCase()}:/${p.slice(3)}`;
  return p;
}

// resolveCmd 对齐 multica 的 LookPath 发现（deep/multica.md §5）：
// 1) envKey 覆盖优先（CLAUDE_PATH / OPENCODE_PATH / CURSOR_PATH）
// 2) 否则 where(windows) / which(unix) 逐个解析候选命令名
// 3) 全部失败后登录 shell 兜底（resolveAgentsViaLoginShell）：nvm/fnm/rc 文件里
//    的 PATH 只有登录 shell 才有。探测链幂等：不缓存、不改 env，失败静默返回 null。
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

  const shell = await resolveLoginShell();
  if (!shell) return null;
  const safe = candidates.filter((c) => SAFE_CMD_NAME.test(c));
  if (safe.length === 0) return null;
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync(
      shell,
      ['-ilc', buildLoginShellResolveScript(safe)],
      { timeout: LOGIN_SHELL_TIMEOUT, windowsHide: true },
    ));
  } catch {
    // 超时 / 退出码非零 / spawn 失败：静默放弃，探测链幂等
    return null;
  }
  const found = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const [name, ...rest] = line.trim().split('\t');
    const p = rest.join('\t').trim();
    if (!name || !p || !isAbsolutePath(p)) continue;
    found.set(name, p);
  }
  for (const c of candidates) {
    const p = found.get(c);
    if (!p) continue;
    const spawnable = toSpawnablePath(p);
    if (process.platform === 'win32') {
      // MSYS 的 command -v 常返回剥掉扩展名的路径（npm shim 产出 <name> 脚本 +
      // <name>.cmd；node 只有 node.exe），而 Windows CreateProcess 只能跑
      // .exe/.cmd/.bat——照 where 分支「优先可执行后缀」的口径先补探后缀，
      // 全失败再退回原路径（access X_OK 校验）。
      for (const ext of WIN_EXE) {
        try {
          await access(`${spawnable}${ext}`, constants.X_OK);
          return `${spawnable}${ext}`;
        } catch {
          /* next */
        }
      }
    }
    try {
      await access(spawnable, constants.X_OK);
      return spawnable;
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
