import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
  TokenUsage,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { killProcessTree, trackChildPid, untrackChildPid } from './process-tree.js';
import { extractTokenUsage, mergeUsage } from './usage-parse.js';
import { safeFormatToolError } from './event-normalizer.js';

export const PI_NOT_INSTALLED_ERROR =
  'Pi SDK / CLI 未安装。请在系统 PATH 中安装 `pi` 命令，或设置 PI_PATH 环境变量。';

// ============================================================================
// pi RPC 协议最小子集（手工摘录，不引入 @earendil-works 依赖）
// 完整规格见 references/repos/pi/packages/coding-agent/src/modes/rpc/rpc-types.ts：
// - stdin 每行一个 JSON 命令；stdout 三通道 demux：response / extension_ui_request / AgentSessionEvent
// - JSONL 帧 LF-only split（禁用 Node readline）；行尾 \r 剥掉；非 JSON 行静默忽略
// ============================================================================

/** 本适配器只发 prompt / abort / get_state 三种命令 */
interface PiCommand {
  id?: string;
  type: 'prompt' | 'abort' | 'get_state';
  message?: string;
}

interface PiContentBlock {
  type: string;
  text?: string;
  [k: string]: unknown;
}

interface PiMessage {
  role?: string;
  content?: string | PiContentBlock[];
  /** AssistantMessage.usage：input/output/cacheRead/cacheWrite（pi-ai types.ts Usage） */
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; [k: string]: unknown };
  [k: string]: unknown;
}

interface PiResponse {
  type: 'response';
  id?: string;
  command?: string;
  success?: boolean;
  error?: string;
  data?: { sessionId?: string; [k: string]: unknown };
}

interface PiEvent {
  type: string;
  message?: PiMessage;
  assistantMessageEvent?: { type?: string; delta?: string };
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  willRetry?: boolean;
  messages?: PiMessage[];
  [k: string]: unknown;
}

/** 字符串化工具结果（对齐 claude-code.ts safeStringifyResult 模式） */
function safeStringifyResult(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content ?? '').slice(0, 4000);
  } catch (err) {
    return safeFormatToolError(err);
  }
}

/** 消息文本：string 原样；块数组取 type==="text" 块拼接（thinking/toolCall 块不计） */
function messageText(msg: PiMessage | undefined): string {
  if (!msg) return '';
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');
  }
  return '';
}

/**
 * PiBackend —— 真 backend：spawn `pi --mode rpc`，JSONL 三通道协议。
 * 完成点判定只看事件流：agent_end(willRetry=false) 是唯一完成信号
 * （prompt 的 success response 只是 preflight 通过，早于完成；退出码不可当完成信号）。
 */
export class PiBackend implements RuntimeBackend {
  readonly id = 'pi' as const;
  readonly label = 'Pi SDK';
  /** 真执行已落地：readiness / 策略层按真 backend 对待 */
  readonly executionImplemented = true;
  /** Slice 50：spawn 带 --session-id 真 resume */
  readonly supportsSessionResume = true;

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('PI_PATH', ['pi']);
    if (!path) return { installed: false, version: null, path: null };
    const version = await versionOf(path);
    return { installed: true, version, path };
  }

  async execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) {
      return {
        finalText: '',
        exitReason: 'failed',
        error: PI_NOT_INSTALLED_ERROR,
      };
    }
    return this.spawnRpc(det.path, input, onEvent, signal);
  }

  /** spawn pi RPC 子进程 + JSONL 帧解析 + 三通道 demux + 事件映射 */
  private spawnRpc(
    bin: string,
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve) => {
      // Windows .cmd/.bat shim 需要 shell:true（对齐 spawn-line.ts:47 isCmdShim）
      const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
      const args = ['--mode', 'rpc'];
      // DS1：真 session resume —— spawn 直接带 --session-id
      const resume = input.resumeSessionId?.trim();
      if (resume) args.push('--session-id', resume);

      let child: ChildProcess;
      try {
        child = spawn(bin, args, {
          cwd: input.cwd, // pi 的 workspace
          shell: isCmdShim,
          windowsHide: true,
          env: process.env,
        });
      } catch (err) {
        resolve({ finalText: '', exitReason: 'failed', error: `pi spawn 失败: ${String(err)}` });
        return;
      }
      if (child.pid) trackChildPid(child.pid);

      let settled = false;
      let closeSeen = false;
      let agentEndSeen = false;
      let messageEndSeen = false;
      let stdoutBuf = '';
      let stderrAll = '';
      const assistantTexts: string[] = [];
      let usageAcc: TokenUsage | null = null;
      let providerSessionId: string | null = null;
      let abortFallbackTimer: ReturnType<typeof setTimeout> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let completeFallbackTimer: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;
      const pending = new Map<string, (r: PiResponse) => void>();

      // spawn 即登记的 close promise：complete() 里等优雅 shutdown 时，
      // 若 close 早已发生则立即放行（不依赖之后才挂的 listener）。
      const closedPromise = new Promise<void>((r) => child.once('close', () => r()));

      const lastAssistantText = (): string => {
        for (let i = assistantTexts.length - 1; i >= 0; i--) {
          if (assistantTexts[i].trim()) return assistantTexts[i];
        }
        return '';
      };

      const finishCompleted = () => {
        finish({
          finalText: lastAssistantText(),
          exitReason: 'completed',
          usage: usageAcc,
          providerSessionId: providerSessionId ?? undefined,
        });
      };

      const finish = (result: ExecutionResult) => {
        if (settled) return;
        settled = true;
        if (abortFallbackTimer) clearTimeout(abortFallbackTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (completeFallbackTimer) clearTimeout(completeFallbackTimer);
        if (child.pid) untrackChildPid(child.pid);
        // 进程还活着就收尾（已完成路径 graceful shutdown 失败 / preflight 失败等）：
        // 强杀防孤儿（killProcessTree 对已退出 pid 无害）。
        if (!closeSeen && child.pid) {
          try {
            killProcessTree(child.pid);
          } catch {
            /* ignore */
          }
        }
        // 仅进程未退出时补 stdin.end()（complete() 已完成路径已 end 过，避免双调）
        if (!closeSeen) {
          try {
            child.stdin?.end();
          } catch {
            /* ignore */
          }
        }
        resolve(result);
      };

      // ---- abort / 硬超时：killProcessTree + 强制 settle 兜底（对齐 spawn-line.ts） ----
      const killTree = () => {
        if (child.pid) killProcessTree(child.pid);
        else {
          try {
            child.kill('SIGTERM');
          } catch {
            /* ignore */
          }
        }
      };

      const onAbort = () => {
        if (settled) return;
        try {
          child.stdin?.write(`${JSON.stringify({ type: 'abort' })}\n`);
        } catch {
          /* ignore */
        }
        killTree();
        // 兜底：进程树 kill 不可靠时 5s 强制 settle，绝不挂起
        abortFallbackTimer = setTimeout(() => {
          finish({
            finalText: lastAssistantText(),
            exitReason: timedOut ? 'failed' : 'cancelled',
            error: timedOut ? `timeout: pi 超过 ${timeoutMs}ms` : undefined,
          });
        }, 5000);
        abortFallbackTimer.unref?.();
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });

      const timeoutMs = input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : 0;
      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          if (settled) return;
          timedOut = true;
          onEvent({ type: 'log', text: `[pi] timeout: 超过 ${timeoutMs}ms，aborting…` });
          killTree();
          abortFallbackTimer = setTimeout(() => {
            finish({
              finalText: lastAssistantText(),
              exitReason: 'failed',
              error: `timeout: pi 超过 ${timeoutMs}ms 未完成`,
            });
          }, 3000);
          abortFallbackTimer.unref?.();
        }, timeoutMs);
      }

      // ---- 命令收发 ----
      const sendRaw = (cmd: PiCommand) => {
        try {
          child.stdin?.write(`${JSON.stringify(cmd)}\n`);
        } catch {
          /* ignore：非致命（abort 等 best-effort 发送） */
        }
      };

      const sendCommand = (cmd: PiCommand & { id: string }): Promise<PiResponse> =>
        new Promise<PiResponse>((res, rej) => {
          if (settled) {
            rej(new Error('pi 已 settle'));
            return;
          }
          if (!child.stdin) {
            rej(new Error('pi 无 stdin（stdio 未连接）'));
            return;
          }
          pending.set(cmd.id, res);
          child.stdin.write(`${JSON.stringify(cmd)}\n`, (err) => {
            if (err) {
              pending.delete(cmd.id);
              rej(err);
            }
          });
        });

      // ---- 三通道 demux ----
      const handleResponse = (resp: PiResponse) => {
        if (resp.id) {
          const p = pending.get(resp.id);
          if (p) {
            pending.delete(resp.id);
            p(resp);
          }
        }
        // fire-and-forget get_state 的 sessionId 捕获（顺序上先于 prompt 事件）
        if (resp.command === 'get_state' && resp.success && resp.data?.sessionId) {
          providerSessionId = resp.data.sessionId;
        }
      };

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let j: unknown;
        try {
          // JSONL 帧：LF-only split；行尾 \r 剥掉；非 JSON 行静默忽略
          j = JSON.parse(trimmed.endsWith('\r') ? trimmed.slice(0, -1) : trimmed);
        } catch {
          return;
        }
        if (!j || typeof j !== 'object') return;
        const rec = j as Record<string, unknown>;
        if (typeof rec.type !== 'string') return;
        if (rec.type === 'response') {
          handleResponse(rec as unknown as PiResponse);
          return;
        }
        if (rec.type === 'extension_ui_request') {
          // 无 UI 会话：忽略（log 一条便于观测）
          onEvent({ type: 'log', text: '[pi] extension_ui_request：无 UI 会话，忽略' });
          return;
        }
        handleAgentEvent(rec as unknown as PiEvent);
      };

      // ---- 事件流映射（§3 表：pi 事件 → 本仓 AgentEvent） ----
      const handleAgentEvent = (ev: PiEvent) => {
        switch (ev.type) {
          case 'message_update': {
            if (
              ev.assistantMessageEvent?.type === 'text_delta' &&
              typeof ev.assistantMessageEvent.delta === 'string'
            ) {
              onEvent({ type: 'message_delta', text: ev.assistantMessageEvent.delta });
            }
            break;
          }
          case 'message_start': {
            if (ev.message?.role === 'user') {
              const text = messageText(ev.message);
              if (text) onEvent({ type: 'message', role: 'user', text });
            }
            break;
          }
          case 'message_end': {
            const msg = ev.message;
            if (!msg) break;
            messageEndSeen = true;
            if (msg.role === 'assistant') {
              const text = messageText(msg);
              if (text) {
                assistantTexts.push(text);
                onEvent({ type: 'message', role: 'assistant', text });
              }
              // usage 求和（所有 assistant 消息的 input/output/cacheRead/cacheWrite；
              // 本仓无 cost 落库列）
              const u = extractTokenUsage(msg.usage);
              if (u) usageAcc = mergeUsage(usageAcc, u);
            }
            break;
          }
          case 'tool_execution_start': {
            onEvent({ type: 'tool_start', name: ev.toolName ?? 'tool', args: ev.args });
            break;
          }
          case 'tool_execution_end': {
            const result = safeStringifyResult(ev.result);
            onEvent({ type: 'tool_end', name: ev.toolName ?? 'tool', result });
            if (ev.isError) {
              onEvent({
                type: 'log',
                text: `[pi] tool ${ev.toolName ?? 'tool'} 执行失败: ${result.slice(0, 500)}`,
              });
            }
            break;
          }
          case 'agent_end': {
            if (ev.willRetry === true) {
              // auto-retry 轮次：继续等下一个 agent_end
              onEvent({ type: 'log', text: '[pi] agent_end willRetry=true，自动重试中，继续等待…' });
              break;
            }
            agentEndSeen = true;
            if (!messageEndSeen && Array.isArray(ev.messages)) {
              // 无 message_end 流（少见）：从 agent_end.messages 兜底取文本与 usage
              for (const m of ev.messages) {
                if (m?.role === 'assistant') {
                  const t = messageText(m);
                  if (t) assistantTexts.push(t);
                  const u = extractTokenUsage(m.usage);
                  if (u) usageAcc = mergeUsage(usageAcc, u);
                }
              }
            }
            complete();
            break;
          }
          case 'agent_start':
          case 'queue_update':
          case 'compaction_start':
          case 'compaction_end':
          case 'auto_retry_start':
          case 'auto_retry_end':
          case 'extension_error':
          case 'turn_start':
          case 'turn_end':
          case 'session_start':
          case 'session_end':
          case 'session_info_changed':
          case 'thinking_level_changed':
          case 'model_select':
          default:
            onEvent({ type: 'log', text: `[pi] ${ev.type}` });
            break;
        }
      };

      // ---- 完成点（agent_end willRetry=false）：优雅收尾，绝不挂起 ----
      const complete = () => {
        if (settled) return;
        try {
          child.stdin?.end(); // pi 优雅 shutdown(0)
        } catch {
          /* ignore */
        }
        completeFallbackTimer = setTimeout(() => finishCompleted(), 10_000);
        completeFallbackTimer.unref?.();
        void closedPromise.then(() => {
          if (completeFallbackTimer) clearTimeout(completeFallbackTimer);
          finishCompleted();
        });
      };

      // ---- 主流程：get_state(fire-and-forget 拿 sessionId) → prompt → 等 agent_end ----
      // 注意：本 IIFE 同步发 get_state/prompt，必须放在 sendRaw/sendCommand 声明之后。
      void (async () => {
        try {
          // fire-and-forget：不阻塞主流程，sessionId 由 demux 侧捕获（get_state 响应先于 prompt 事件）
          sendRaw({ type: 'get_state' });
          const promptResp = await sendCommand({ id: 'ma-prompt', type: 'prompt', message: input.prompt });
          if (settled) return;
          if (!promptResp.success) {
            // preflight 失败 → 直接 fail（finish 会清理子进程）
            finish({
              finalText: '',
              exitReason: 'failed',
              error: promptResp.error ?? 'pi prompt preflight 失败',
            });
            return;
          }
          // success 只是 preflight 通过：完成点由 agent_end 决定，此处不再 await 任何东西
        } catch (err) {
          if (!settled) {
            finish({ finalText: '', exitReason: 'failed', error: `pi RPC 异常: ${String(err)}` });
          }
        }
      })();

      // ---- 子进程事件 ----
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdoutBuf += chunk;
        // JSONL 帧：LF-only split（禁用 readline，U+2028/2029 陷阱）
        while (true) {
          const nl = stdoutBuf.indexOf('\n');
          if (nl === -1) break;
          const line = stdoutBuf.slice(0, nl);
          stdoutBuf = stdoutBuf.slice(nl + 1);
          handleLine(line);
        }
      });
      child.stderr?.on('data', (chunk: string) => {
        stderrAll += chunk;
      });
      child.on('error', (err) => {
        finish({ finalText: '', exitReason: 'failed', error: `pi 启动失败: ${String(err)}` });
      });
      child.on('close', (code) => {
        closeSeen = true;
        if (settled) return;
        if (signal.aborted) {
          finish({ finalText: lastAssistantText(), exitReason: 'cancelled' });
          return;
        }
        // 残留帧冲洗（末行无 \n 的完整 JSON）
        if (stdoutBuf.trim()) {
          const leftover = stdoutBuf;
          stdoutBuf = '';
          handleLine(leftover);
        }
        if (settled || agentEndSeen) return; // 完成已由事件流确定
        // 启动即退 / 完成前退出：归 failed 并带 stderr，绝不挂起
        finish({
          finalText: lastAssistantText(),
          exitReason: 'failed',
          error: stderrAll.trim() || `pi 退出码 ${code ?? 'unknown'}`,
        });
      });
    });
  }
}
