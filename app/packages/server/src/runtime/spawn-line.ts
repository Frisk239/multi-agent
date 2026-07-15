import { spawn } from 'node:child_process';
import type { AgentEvent, ExecutionResult } from './types.js';

// ANSI 转义序列剥离（opencode 等 CLI 输出含 \x1b[0m 色码，进 finalText 前清掉）
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// LineHandler：stream-json backend 每行回调。可通过 ctx.resultText 覆盖最终文本
// （对齐 multica claude.go:179 —— result 行的 .result 才是人读 finalText，
// 比拼 stdoutAll 更准）。
export interface LineContext {
  resultText: string | null;
}
export type LineHandler = (
  line: string,
  onEvent: (e: AgentEvent) => void,
  ctx: LineContext,
) => void;

// spawnLineProcess —— 三 Backend 共用的子进程驱动。
// Windows 进程树 kill 对齐 plan：AbortSignal → child.kill + taskkill /T /F 双保险。
// Windows .cmd 处理：cursor-agent 经 where 解析出 .cmd，spawn 必须 shell:true 才能执行。
export function spawnLineProcess(
  bin: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  onEvent: (e: AgentEvent) => void,
  onLine: LineHandler | null,
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    // Windows 上 .cmd/.bat 启动器需要 shell:true（cursor-agent.cmd 坑，
    // 对齐 multica cursor_invocation_windows.go 的 .cmd 处理需求）
    const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
    const child = spawn(bin, args, {
      cwd,
      shell: isCmdShim,
      windowsHide: true,
      env: process.env,
    });
    let buf = '';
    let stdoutAll = '';
    let stderrAll = '';
    let settled = false;
    const lineCtx: LineContext = { resultText: null };

    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const onAbort = () => {
      try {
        child.kill('SIGTERM');
        if (process.platform === 'win32' && child.pid) {
          // /T 杀整棵进程树（对齐 plan + multica deep §5）
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
          });
        }
      } catch {
        /* ignore */
      }
      // 兜底：Windows shell:true spawn 的进程树 kill 不可靠（cmd.exe shim 退出后
      // opencode.exe 成孤儿，close 事件不触发，Promise 永挂 → worker busy 死锁）。
      // abort 后 5s 若仍未 settle，强制 finish(cancelled)，打破死锁。
      setTimeout(() => {
        finish({ finalText: stdoutAll.trim(), exitReason: 'cancelled' });
      }, 5000);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutAll += chunk;
      if (!onLine) return;
      buf += chunk;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? '';
      for (const line of parts) {
        if (line.trim()) onLine(line, onEvent, lineCtx);
      }
    });
    child.stderr?.on('data', (chunk: string) => {
      stderrAll += chunk;
      onEvent({ type: 'log', text: chunk });
    });
    child.on('error', (err) => {
      finish({ finalText: '', exitReason: 'failed', error: String(err) });
    });
    child.on('close', (code) => {
      if (signal.aborted) {
        finish({ finalText: stdoutAll.trim(), exitReason: 'cancelled' });
        return;
      }
      if (buf.trim() && onLine) onLine(buf, onEvent, lineCtx);
      // stream-json backend 用 result 行覆盖 finalText（更准）；
      // 无 onLine（opencode 降级）则整段 stdout 作一条 assistant message。
      const finalText = lineCtx.resultText ?? stdoutAll.trim();
      if (!onLine && stdoutAll.trim()) {
        onEvent({ type: 'message', role: 'assistant', text: stripAnsi(stdoutAll.trim()) });
      }
      if (code === 0) {
        finish({ finalText: stripAnsi(finalText), exitReason: 'completed' });
      } else {
        finish({
          finalText: stripAnsi(finalText),
          exitReason: 'failed',
          error: stderrAll.trim() || `exit ${code}`,
        });
      }
    });
  });
}
