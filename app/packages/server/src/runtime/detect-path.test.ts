import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// execFile/access 全部 mock：detect-path 用 promisify 包 execFile（回调风格），
// 所以 execFile mock 必须按 (cmd, args, opts, cb) 回调形态实现，不能 mockResolvedValue。
// 两个 mock 都按调用顺序出队响应，队空则默认成功（access）或失败（execFile）。
const { execFileMock, accessMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  accessMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: execFileMock };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, access: accessMock };
});

import { resolveCmd } from './detect-path.js';

type ExecFileResult = { stdout: string; stderr: string };
type ExecFileCb = (err: Error | null, result?: ExecFileResult) => void;

const execFileQueue: Array<{ stdout?: string; error?: Error }> = [];
function queueExecFile(stdout?: string, error?: Error): void {
  execFileQueue.push({ stdout, error });
}

const accessQueue: Array<{ error?: Error }> = [];
function queueAccess(error?: Error): void {
  accessQueue.push({ error });
}

beforeEach(() => {
  execFileQueue.length = 0;
  accessQueue.length = 0;
  vi.clearAllMocks(); // 清调用历史（restoreAllMocks 不清 calls）
  execFileMock.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
      const next = execFileQueue.shift();
      if (next?.error) {
        cb(next.error);
      } else {
        cb(null, { stdout: next?.stdout ?? '', stderr: '' });
      }
    },
  );
  // access 默认放行（路径存在且可执行）；需要失败时按顺序 queueAccess(error)
  accessMock.mockImplementation(async () => {
    const next = accessQueue.shift();
    if (next?.error) throw next.error;
    return undefined;
  });
  vi.stubEnv('SHELL', '/bin/bash');
  setPlatform('linux');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (ORIGINAL_PLATFORM) {
    Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM);
  }
});

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

describe('resolveCmd 登录 shell 兜底', () => {
  it('env 覆盖仍优先（回归）：不碰 execFile', async () => {
    vi.stubEnv('CLAUDE_PATH', '/opt/claude');
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBe(
      '/opt/claude',
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('which 命中时走原路径，不触发登录 shell（回归）', async () => {
    queueExecFile('/usr/bin/claude\n');
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBe(
      '/usr/bin/claude',
    );
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(
      'which',
      ['claude'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('which 失败 + 登录 shell 命中：返回路径且过 X_OK 校验', async () => {
    queueExecFile(undefined, new Error('ENOENT')); // which claude 失败
    queueExecFile('claude\t/usr/local/bin/claude\n'); // bash -ilc 输出
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBe(
      '/usr/local/bin/claude',
    );
    // 登录 shell 用 -ilc + 带 unalias 的脚本 + 8000ms 超时
    expect(execFileMock).toHaveBeenCalledWith(
      '/bin/bash',
      ['-ilc', expect.stringContaining('for n in claude; do')],
      expect.objectContaining({ timeout: 8000 }),
      expect.any(Function),
    );
    const [, args] = execFileMock.mock.calls[1] as [string, string[], unknown];
    expect(args[1]).toContain('command -v "$n"');
    expect(args[1]).toContain('unalias "$n" 2>/dev/null');
    // 结果路径过 access(X_OK) reality check 才返回
    expect(accessMock).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      expect.anything(),
    );
  });

  it('登录 shell 未命中（空输出）返回 null', async () => {
    queueExecFile(undefined, new Error('ENOENT'));
    queueExecFile('');
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBeNull();
  });

  it('登录 shell 输出的非绝对路径被丢弃', async () => {
    queueExecFile(undefined, new Error('ENOENT'));
    // 别名定义（unalias 未生效的防御）或相对路径都不该被采信
    queueExecFile("claude\tclaude: aliased to 'winpty claude.exe'\n");
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBeNull();
  });

  it('登录 shell 超时（对齐 versionOf 8000ms）静默返回 null', async () => {
    queueExecFile(undefined, new Error('ENOENT'));
    queueExecFile(
      undefined,
      Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    );
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBeNull();
    expect(execFileMock).toHaveBeenCalledTimes(2); // 超时后不再有额外探测
  });

  it('$SHELL 缺失时直接跳过登录 shell', async () => {
    vi.stubEnv('SHELL', '');
    queueExecFile(undefined, new Error('ENOENT'));
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBeNull();
    expect(execFileMock).toHaveBeenCalledTimes(1); // 只有 which，没碰 shell
  });

  it('$SHELL 非白名单（fish）直接跳过', async () => {
    vi.stubEnv('SHELL', '/usr/bin/fish');
    queueExecFile(undefined, new Error('ENOENT'));
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBeNull();
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('不安全候选名不拼进 shell 脚本（isSafeAgentName 口径）', async () => {
    queueExecFile(undefined, new Error('ENOENT')); // which claude
    queueExecFile(undefined, new Error('ENOENT')); // which bad$(rm -rf /)
    queueExecFile('claude\t/usr/bin/claude\n');
    await expect(
      resolveCmd('CLAUDE_PATH', ['claude', 'bad$(rm -rf /)']),
    ).resolves.toBe('/usr/bin/claude');
    const [, args] = execFileMock.mock.calls[2] as [string, string[], unknown];
    expect(args[1]).toContain('for n in claude; do');
    expect(args[1]).not.toContain('bad');
  });

  it('多候选按优先级取第一个命中的', async () => {
    queueExecFile(undefined, new Error('ENOENT')); // which cursor-agent
    queueExecFile(undefined, new Error('ENOENT')); // which cursor
    queueExecFile(
      'cursor-agent\t/opt/cursor-agent/bin/cursor-agent\ncursor\t/opt/cursor/bin/cursor\n',
    );
    await expect(
      resolveCmd('CURSOR_PATH', ['cursor-agent', 'cursor']),
    ).resolves.toBe('/opt/cursor-agent/bin/cursor-agent');
  });

  it('win32：MSYS 路径 /c/... 转成 C:/...，后缀补探全失败后退回原路径', async () => {
    setPlatform('win32');
    queueExecFile(undefined, new Error('ENOENT')); // where claude 失败
    queueExecFile('claude\t/c/Users/me/AppData/Roaming/npm/claude\n');
    queueAccess(); // access /bin/bash（$SHELL 本身）
    queueAccess(new Error('ENOENT')); // .exe 补探失败
    queueAccess(new Error('ENOENT')); // .cmd 补探失败
    queueAccess(new Error('ENOENT')); // .bat 补探失败
    queueAccess(); // 原路径 access X_OK 通过
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBe(
      'C:/Users/me/AppData/Roaming/npm/claude',
    );
    expect(accessMock).toHaveBeenCalledWith(
      'C:/Users/me/AppData/Roaming/npm/claude',
      expect.anything(),
    );
  });

  it('win32：优先补探 .cmd（npm shim 只有 claude.cmd 可 spawn）', async () => {
    setPlatform('win32');
    queueExecFile(undefined, new Error('ENOENT')); // where claude 失败
    queueExecFile('claude\t/c/Users/me/AppData/Roaming/npm/claude\n');
    queueAccess(); // access /bin/bash
    queueAccess(new Error('ENOENT')); // .exe 补探失败
    queueAccess(); // .cmd 补探通过
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBe(
      'C:/Users/me/AppData/Roaming/npm/claude.cmd',
    );
  });

  it('win32：MSYS 路径缺扩展名时补探 .exe（node → node.exe）', async () => {
    setPlatform('win32');
    vi.stubEnv('SHELL', '/usr/bin/bash'); // MSYS 形态 $SHELL
    queueExecFile(undefined, new Error('ENOENT')); // where node 失败
    queueExecFile('C:\\Program Files\\Git\\usr\\bin\\bash.exe\n'); // where bash
    queueExecFile('node\t/c/Program Files/nodejs/node\n'); // command -v 剥了 .exe
    queueAccess(new Error('ENOENT')); // access /usr/bin/bash（MSYS，Node 摸不到）
    queueAccess(); // access where 找到的 bash.exe
    queueAccess(); // 补探 .exe：C:/Program Files/nodejs/node.exe 存在
    await expect(resolveCmd('CLAUDE_PATH', ['node'])).resolves.toBe(
      'C:/Program Files/nodejs/node.exe',
    );
  });

  it('win32：MSYS 形态 $SHELL 经 where 解析出可 spawn 的 bash', async () => {
    setPlatform('win32');
    vi.stubEnv('SHELL', '/usr/bin/bash');
    queueExecFile(undefined, new Error('ENOENT')); // where claude 失败
    queueExecFile('C:\\Program Files\\Git\\usr\\bin\\bash.exe\n'); // where bash
    queueExecFile('claude\t/c/Users/me/.claude/local/claude\n'); // bash -ilc
    queueAccess(new Error('ENOENT')); // access /usr/bin/bash
    queueAccess(); // access where 找到的 bash.exe
    queueAccess(new Error('ENOENT')); // 补探 .exe 失败
    queueAccess(new Error('ENOENT')); // 补探 .cmd 失败
    queueAccess(new Error('ENOENT')); // 补探 .bat 失败
    queueAccess(); // 原路径 access X_OK 通过
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBe(
      'C:/Users/me/.claude/local/claude',
    );
    // 实际 spawn 的是 where 解析出的 Windows 形态 bash
    expect(execFileMock).toHaveBeenCalledWith(
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      ['-ilc', expect.any(String)],
      expect.objectContaining({ timeout: 8000 }),
      expect.any(Function),
    );
  });

  it('win32：$SHELL 非白名单（cmd.exe）不折腾', async () => {
    setPlatform('win32');
    vi.stubEnv('SHELL', 'C:\\Windows\\System32\\cmd.exe');
    queueExecFile(undefined, new Error('ENOENT')); // where claude
    await expect(resolveCmd('CLAUDE_PATH', ['claude'])).resolves.toBeNull();
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });
});
