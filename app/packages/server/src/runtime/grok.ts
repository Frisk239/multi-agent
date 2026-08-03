import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
  TokenUsage,
} from './types.js';
import type { RunCommandInput, RunCommandResult } from '@ma/shared';
import { resolveCmd, versionOf } from './detect-path.js';
import {
  buildAcpMcpServers,
  extractAcpMcpCapabilities,
  filterAcpMcpServersByCapability,
  type AcpMcpServer,
} from './acp-mcp.js';
import {
  AcpTransport,
  AcpRpcError,
  isAcpSessionNotFound,
  parseAcpTokenUsage,
  parseAcpModelIdFromMeta,
  extractAcpSessionId,
  extractAcpAuthMethods,
  extractAcpCurrentModelId,
  resolveResumedSessionId,
  AcpDeliverableTracker,
  AcpProviderErrorSniffer,
  acpToolNameFromTitle,
  acpRawText,
  extractAcpToolCallText,
  type AcpSessionUpdate,
} from './acp-transport.js';

/**
 * Grok Build CLI（xAI `grok` 二进制）——完整 ACP stdio 客户端（G1-2 收官）。
 * Multica 真源：`references/repos/multica/server/pkg/agent/grok.go` +
 * `hermes.go`（hermesClient 传输）；协议状态机与实测见
 * `.scratch/grok-acp/research.md`。
 *
 * 本仓适配（纯本地、不自造 agent loop）：
 * - spawn `grok --no-auto-update agent --always-approve [--effort] [custom] stdio`
 * - initialize → authenticate（cached_token，密钥不落库）→ session/new|load →
 *   （可选 set_model）→ session/prompt → 事件流 → drain → Result
 * - 流式事件归一化为既有 AgentEvent（message/log/tool_start/tool_end）
 * - prompt 响应 `_meta.usage` 结构化落库（对齐 usage-parse/model-rates 管道）
 * - session id 持久化 + session/load 续跑（supportsSessionResume=true）
 */

// 握手类请求（initialize/auth/session 建立）超时；prompt 无硬超时（wall 由 worker 负责）
const HANDSHAKE_TIMEOUT_MS = 30_000;
// prompt 返回后残留通知的静默窗口（对齐 multica acpNotificationQuietTime / drain grace）
const NOTIFICATION_QUIET_MS = 250;
const DRAIN_HARD_MS = 2_000;

/** 被 daemon 锁定的 grok flag（对齐 multica grok.go grokBlockedArgs）：custom_args 不得覆盖 */
const GROK_BLOCKED_ARGS = new Set([
  'agent', 'stdio', 'headless', 'serve', 'leader',
  '--always-approve', '--yolo', '--no-auto-update', '--no-alt-screen',
  '-p', '--print', '-c', '--continue', '--fork-session',
]);
/** 带值的被锁 flag：命中时连值一起跳过 */
const GROK_BLOCKED_VALUE_ARGS = new Set([
  '--single', '--output-format', '--permission-mode', '-m', '--model',
  '--reasoning-effort', '--effort', '-r', '--resume', '-s', '--session-id',
  '--system-prompt-override', '--cwd', '--ref', '-w', '--worktree',
]);

/**
 * 构建 grok ACP argv（对齐 multica grok.go:140-145）：
 * `--no-auto-update`（全局 flag）→ `agent --always-approve [--effort L]` →
 * custom_args（被锁 flag 过滤）→ `stdio`。
 * model 不走 argv：session 建立后经 session/set_model（ACP 语义）。
 */
export function buildGrokAgentArgs(
  input: Pick<ExecutionInput, 'thinkingLevel' | 'customArgs'>,
): string[] {
  const args = ['--no-auto-update', 'agent', '--always-approve'];
  const effort = input.thinkingLevel?.trim();
  if (effort) args.push('--effort', effort);
  // G3-4b：custom_args 注入（被锁 flag 及带值 flag 过滤，防破坏 ACP 契约）
  const custom = input.customArgs ?? [];
  for (let i = 0; i < custom.length; i++) {
    const a = custom[i]!;
    if (GROK_BLOCKED_ARGS.has(a)) continue;
    if (GROK_BLOCKED_VALUE_ARGS.has(a)) {
      i++; // 吞掉其值
      continue;
    }
    args.push(a);
  }
  args.push('stdio');
  return args;
}

/** 选 ACP auth 方法：cached_token 优先（本机凭据，密钥不落库）；XAI_API_KEY 在 env 才考虑 API key */
function pickGrokAuthMethod(methods: string[], haveApiKey: boolean): string | null {
  if (haveApiKey && methods.includes('xai.api_key')) return 'xai.api_key';
  if (methods.includes('cached_token')) return 'cached_token';
  return null;
}

/** usage_update 是累计快照 → 逐字段取 max（对齐 multica hermes.go:1745 handleUsageUpdate） */
function maxUsage(a: TokenUsage | null, b: TokenUsage | null): TokenUsage | null {
  if (!a) return b;
  if (!b) return a;
  const take = (x: number | null | undefined, y: number | null | undefined) => {
    if (x == null) return y ?? null;
    if (y == null) return x;
    return Math.max(x, y);
  };
  return {
    input: take(a.input, b.input),
    output: take(a.output, b.output),
    cacheRead: take(a.cacheRead, b.cacheRead),
    cacheWrite: take(a.cacheWrite, b.cacheWrite),
  };
}

export class GrokBackend implements RuntimeBackend {
  readonly id = 'grok' as const;
  readonly label = 'Grok Build';
  /**
   * G1-2 收官（2026-08-03）：本仓已实现 ACP stdio 客户端（session/new|load +
   * prompt），session id 持久化 + session/load 续跑为真 —— 恢复 true
   * （此前 fail-closed 的 false 声明基于 print 降级形态，见 research.md §4）。
   */
  readonly supportsSessionResume = true;

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('GROK_PATH', ['grok']);
    if (!path) return { installed: false, version: null, path: null };
    return { installed: true, version: await versionOf(path), path };
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
        error:
          'Grok Build CLI 未安装。请安装 xAI Grok CLI（`grok` 在 PATH），或设置 GROK_PATH。参见 https://docs.x.ai/build/cli',
      };
    }

    onEvent({ type: 'log', text: '[grok] starting ACP stdio session…' });

    // ---- 会话状态（回调闭包共享）----
    // streaming gate：session/prompt 发送后才接受更新——防历史回放/会话建立期通知重复输出
    let streaming = false;
    let sessionId: string | null = null;
    let usage: TokenUsage | null = null;
    let stopReason = '';
    let activityAt = 0;
    const deliverable = new AcpDeliverableTracker();
    const sniffer = new AcpProviderErrorSniffer('grok');
    // tool_call → tool_call_update 按 callId 关联工具名（update 帧可能不携 title，
    // 对齐 multica hermesClient pendingTools 思路）
    const toolNames = new Map<string, string>();

    const transport = new AcpTransport({
      bin: det.path,
      args: buildGrokAgentArgs(input),
      cwd: input.cwd,
      // G3-4b：agent.env_vars 显式覆盖子进程 env
      env: input.envVars ?? undefined,
      signal,
      callbacks: {
        onUpdate: (u: AcpSessionUpdate) => {
          if (!streaming) return;
          activityAt = Date.now();
          switch (u.type) {
            case 'agent_message_chunk': {
              const text = acpRawText((u.data.content as Record<string, unknown> | undefined)?.text);
              if (text) {
                deliverable.observe(text, false);
                onEvent({ type: 'message', role: 'assistant', text });
              }
              break;
            }
            case 'agent_thought_chunk': {
              const text = acpRawText((u.data.content as Record<string, unknown> | undefined)?.text);
              if (text) onEvent({ type: 'log', text }); // log 通道 = UI 直播 thinking
              break;
            }
            case 'user_message_chunk':
              break; // prompt 回显，不落
            case 'tool_call': {
              deliverable.observe(null, true);
              const name =
                acpToolNameFromTitle(u.data.title, u.data.kind) || acpRawText(u.data.name);
              if (name) {
                if (typeof u.data.toolCallId === 'string') {
                  toolNames.set(u.data.toolCallId, name);
                }
                onEvent({
                  type: 'tool_start',
                  name,
                  args: u.data.rawInput ?? u.data.input ?? u.data.parameters ?? undefined,
                });
              }
              break;
            }
            case 'tool_call_update': {
              const st = u.data.status;
              if (st !== 'completed' && st !== 'failed') break; // 中途流式帧不落
              const callId = typeof u.data.toolCallId === 'string' ? u.data.toolCallId : '';
              const name =
                (callId && toolNames.get(callId)) ||
                acpToolNameFromTitle(u.data.title, u.data.kind) ||
                acpRawText(u.data.name) ||
                'tool';
              if (callId) toolNames.delete(callId);
              const output =
                acpRawText(u.data.rawOutput) ||
                acpRawText(u.data.output) ||
                extractAcpToolCallText(u.data.content);
              onEvent({ type: 'tool_end', name, result: output });
              break;
            }
            case 'usage_update': {
              const uu = parseAcpTokenUsage(u.data.usage);
              if (uu) usage = maxUsage(usage, uu);
              break;
            }
          }
        },
        onActivity: () => {
          if (streaming) activityAt = Date.now();
        },
        onStderr: (chunk) => {
          sniffer.feed(chunk);
        },
        // 私有通知（_x.ai/...）只报 method 名；payload 不进日志（含本机凭据，实测见 research.md §3）
        onOtherNotification: () => {},
      },
    });

    // chat 等短任务：整体硬超时（对齐 spawnLineProcess 的 timeoutMs 语义）
    let timedOut = false;
    let finalStatus: 'completed' | 'cancelled' | 'failed' = 'completed';
    let finalError = '';
    // resume 时 session 被拒（lost）→ 清 id，让 worker 记 resume_miss 并下次 fresh
    let resumeRejected = false;

    const timeoutTimer =
      input.timeoutMs && input.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            transport.cancel();
          }, input.timeoutMs)
        : null;

    const fail = (error: string, status: 'failed' | 'cancelled' = 'failed') => {
      finalStatus = status;
      finalError = error;
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      // 1) initialize 握手
      const initResult = (await transport.request(
        'initialize',
        {
          protocolVersion: 1,
          clientInfo: { name: 'ma-orchestrator', version: '0.1.0' },
          clientCapabilities: {},
        },
        { timeoutMs: HANDSHAKE_TIMEOUT_MS },
      )) as Record<string, unknown>;

      // 2) authenticate（grok 必须显式 auth 才能 session 操作）
      const methods = extractAcpAuthMethods(initResult);
      const authMethod = pickGrokAuthMethod(methods, Boolean(process.env.XAI_API_KEY?.trim()));
      if (!authMethod) {
        fail(
          'grok 认证失败：ACP 未提供可用的认证方法' +
            (methods.length
              ? `（提供：${methods.join('、')}）`
              : '') +
            '。请先运行 `grok login`（本机 ~/.grok/auth.json 凭据，密钥不落本仓），或设置 XAI_API_KEY。',
        );
        return this.finish(onEvent, transport, { streaming, timedOut, timeoutTimer, finalStatus, finalError, deliverable, usage, sessionId, resumeRejected, sniffer, signal });
      }
      await transport.request(
        'authenticate',
        { methodId: authMethod, _meta: { headless: true } },
        { timeoutMs: HANDSHAKE_TIMEOUT_MS },
      );
      onEvent({ type: 'log', text: `[grok] ACP authenticated (${authMethod})` });

      // 2.5) MCP 注入（Q2：agent.mcpServers → ACP array shape，按 initialize
      // 声明的 mcpCapabilities 过滤远程 transport；stdio 总通过。学 multica
      // hermes.go:1986 buildACPMcpServers + grok.go:317）
      let mcpServers: AcpMcpServer[] = [];
      if (input.mcpServers?.trim()) {
        try {
          mcpServers = filterAcpMcpServersByCapability(
            buildAcpMcpServers(input.mcpServers),
            extractAcpMcpCapabilities(initResult),
            'grok',
            (msg) => onEvent({ type: 'log', text: `[grok] ${msg}` }),
          );
          if (mcpServers.length) {
            onEvent({
              type: 'log',
              text: `[grok] 注入 ${mcpServers.length} 个 MCP server（ACP session/new）`,
            });
          }
        } catch (err) {
          fail(`grok MCP 配置解析失败：${errText(err)}（agent.mcpServers 需为 {"mcpServers": {...}} JSON）`);
          return this.finish(onEvent, transport, { streaming, timedOut, timeoutTimer, finalStatus, finalError, deliverable, usage, sessionId, resumeRejected, sniffer, signal });
        }
      }

      // 3) session/new | session/load（resume）
      const cwd = input.cwd || '.';
      const resumeId = input.resumeSessionId?.trim() || '';
      let sessionResp: Record<string, unknown> | null = null;
      if (resumeId) {
        sessionResp = (await transport.request(
          'session/load',
          { cwd, sessionId: resumeId, mcpServers },
          { timeoutMs: HANDSHAKE_TIMEOUT_MS },
        )) as Record<string, unknown>;
        sessionId = resolveResumedSessionId(resumeId, sessionResp);
        if (sessionId !== resumeId) {
          onEvent({
            type: 'log',
            text: `[grok] resume 会话 id 变更（${resumeId.slice(0, 12)}… → ${sessionId.slice(0, 12)}…）`,
          });
        }
        onEvent({ type: 'log', text: `[grok] resumed session ${sessionId.slice(0, 12)}…` });
      } else {
        sessionResp = (await transport.request(
          'session/new',
          { cwd, mcpServers },
          { timeoutMs: HANDSHAKE_TIMEOUT_MS },
        )) as Record<string, unknown>;
        sessionId = extractAcpSessionId(sessionResp);
        if (!sessionId) {
          fail('grok session/new 未返回 session id（ACP 协议异常）');
          return this.finish(onEvent, transport, { streaming, timedOut, timeoutTimer, finalStatus, finalError, deliverable, usage, sessionId, resumeRejected, sniffer, signal });
        }
        onEvent({ type: 'log', text: `[grok] session created ${sessionId.slice(0, 12)}…` });
      }

      // 4) 可选 model 绑定（G22：agent.model → session/set_model；失败诚实 fail）。
      // 会话已在该模型时跳过（防重复 set_model 触发 provider 重路由，对齐 hermes.go:465）
      const model = input.model?.trim();
      const currentModel = extractAcpCurrentModelId(sessionResp);
      if (model && model !== currentModel) {
        try {
          await transport.request(
            'session/set_model',
            { sessionId, modelId: model },
            { timeoutMs: HANDSHAKE_TIMEOUT_MS },
          );
          onEvent({ type: 'log', text: `[grok] model set: ${model}` });
        } catch (err) {
          if (resumeId && isAcpSessionNotFound(err)) {
            sessionId = null;
            resumeRejected = true;
          }
          fail(`grok 无法切换到模型 ${model}：${errText(err)}`);
          return this.finish(onEvent, transport, { streaming, timedOut, timeoutTimer, finalStatus, finalError, deliverable, usage, sessionId, resumeRejected, sniffer, signal });
        }
      }

      // 5) prompt：流式事件（gate 打开）
      streaming = true;
      activityAt = Date.now();
      const promptRes = (await transport.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: input.prompt }],
      })) as Record<string, unknown>;

      // usage：prompt 响应 顶层 usage → _meta.usage → _meta 平铺（实测只在响应 _meta）
      const respUsage =
        parseAcpTokenUsage(promptRes.usage) ??
        parseAcpTokenUsage((promptRes._meta as Record<string, unknown> | undefined)?.usage) ??
        parseAcpTokenUsage(promptRes._meta);
      if (respUsage) usage = maxUsage(usage, respUsage);
      if (typeof promptRes.stopReason === 'string') stopReason = promptRes.stopReason;
      // 响应 _meta.modelId 是回合计费模型（session/load 无模型时唯一权威）
      const respModel = parseAcpModelIdFromMeta(promptRes._meta);
      void respModel;

      // 6) drain：静默 250ms 或硬 2s（吞掉 prompt 响应后到达的收尾通知）
      const drainStart = Date.now();
      while (Date.now() - activityAt < NOTIFICATION_QUIET_MS && Date.now() - drainStart < DRAIN_HARD_MS) {
        await sleep(50);
      }
    } catch (err) {
      if (signal.aborted) {
        fail('execution cancelled', 'cancelled');
      } else if (timedOut) {
        fail(`timeout: grok ACP exceeded ${input.timeoutMs}ms without finishing`);
      } else if (err instanceof AcpRpcError && isAcpSessionNotFound(err) && (input.resumeSessionId?.trim() || '')) {
        // resume 的会话在 agent 侧已丢失：清 id → worker 记 resume_miss → 下次 fresh
        sessionId = null;
        resumeRejected = true;
        fail(`grok 无法恢复会话 ${(input.resumeSessionId ?? '').slice(0, 12)}…：${errText(err)}`);
      } else if (err instanceof AcpRpcError && /authenticate/.test(err.method)) {
        fail(`grok 认证失败（${err.code}）：${err.message}${err.data ? `（${err.data}）` : ''}。请运行 \`grok login\` 后重试。`);
      } else if (err instanceof AcpRpcError && /session\/(new|load)/.test(err.method)) {
        fail(`grok ${err.method} 失败：${errText(err)}`);
      } else if (err instanceof AcpRpcError && err.method === 'session/prompt') {
        fail(`grok session/prompt 失败：${errText(err)}`);
      } else {
        // 通用失败：stderr 嗅探到的线索（如上游 Settings fetch failed）并入文案，可诊断
        const hint = sniffer.message();
        fail(`grok ACP 失败：${errText(err)}${hint ? `（stderr：${hint}）` : ''}`);
      }
    } finally {
      streaming = false;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      await transport.close();
    }

    // ---- 结果组装 ----
    const { deliverable: finalText } = deliverable.result();

    // 失败诚实：stderr 终端失败标记（auth/429/quota）→ completed 提升 failed
    if (finalStatus === 'completed') {
      const term = sniffer.terminalMessage();
      if (term) {
        finalStatus = 'failed';
        finalError = term;
      } else if (!finalText.trim() && sniffer.message()) {
        finalStatus = 'failed';
        finalError = sniffer.message();
      }
    }
    if (stopReason === 'cancelled') {
      finalStatus = 'failed';
      finalError = finalError || 'grok cancelled the prompt';
    }

    const result: ExecutionResult = {
      finalText: finalText.trim(),
      exitReason: finalStatus,
      usage,
      // resume 被拒/失败 → 不落死 id（worker finalizeSessionFields 处理 resume_miss）
      providerSessionId: resumeRejected ? null : sessionId,
    };
    if (finalError) result.error = finalError;
    return result;
  }

  private async finish(
    onEvent: (e: AgentEvent) => void,
    transport: AcpTransport,
    s: {
      streaming: boolean;
      timedOut: boolean;
      timeoutTimer: ReturnType<typeof setTimeout> | null;
      finalStatus: 'completed' | 'cancelled' | 'failed';
      finalError: string;
      deliverable: AcpDeliverableTracker;
      usage: TokenUsage | null;
      sessionId: string | null;
      resumeRejected: boolean;
      sniffer: AcpProviderErrorSniffer;
      signal: AbortSignal;
    },
  ): Promise<ExecutionResult> {
    s.streaming = false;
    if (s.timeoutTimer) clearTimeout(s.timeoutTimer);
    if (s.signal.aborted && s.finalStatus !== 'failed') s.finalStatus = 'cancelled';
    await transport.close();
    const { deliverable: finalText } = s.deliverable.result();
    const result: ExecutionResult = {
      finalText: finalText.trim(),
      exitReason: s.finalStatus,
      usage: s.usage,
      providerSessionId: s.resumeRejected ? null : s.sessionId,
    };
    const err = s.finalError || s.sniffer.terminalMessage() || '';
    if (err) result.error = err;
    return result;
  }

  /**
   * G1-1 接口诚实实现：grok ACP 运行中不支持 steer/compact/set_model——
   * ACP v1 无对应方法（仅 session/cancel），multica 对 ACP backend 亦未实现
   * （research.md §5.6）。返回明确错误而非假装成功。
   */
  async sendRunCommand(runId: string, command: RunCommandInput): Promise<RunCommandResult> {
    void runId;
    return {
      ok: false,
      error: `grok ACP 运行中不支持 ${command.command}（ACP v1 无对应方法；请等 run 结束后发起新 run）`,
    };
  }
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 供 list-models：静态常用 Grok 模型（Multica grok_test 出现的 id） */
export function listGrokStaticModels(): {
  id: string;
  label: string;
  provider?: string;
  isDefault?: boolean;
}[] {
  return [
    { id: 'grok-4.5', label: 'Grok 4.5', provider: 'xai', isDefault: true },
    {
      id: 'grok-composer-2.5-fast',
      label: 'Grok Composer 2.5 Fast',
      provider: 'xai',
    },
    { id: 'grok-3', label: 'Grok 3', provider: 'xai' },
    { id: 'grok-3-mini', label: 'Grok 3 Mini', provider: 'xai' },
  ];
}
