import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, stripAnsi } from './spawn-line.js';
import { extractTokenUsage, mergeUsage } from './usage-parse.js';
import { spawn } from 'node:child_process';

/**
 * Grok Build CLI（xAI `grok` 二进制）。
 * Multica 真源：`references/repos/multica/server/pkg/agent/grok.go`
 *   `grok --no-auto-update agent --always-approve [--effort] stdio` + ACP JSON-RPC
 *
 * 本仓适配（纯本地、不自造 agent loop）：
 * - 探测 PATH 上的 `grok`（env GROK_PATH 可覆盖）
 * - 执行：优先 `grok agent -p <prompt>` 打印模式（若 CLI 支持）；
 *   否则 `grok agent --always-approve` + prompt 入 argv/stdin 文本降级
 * - 非完整 ACP 客户端（避免重写 Multica hermesClient）；有流则 onLine 尽力解析 JSON-RPC
 * - model：若 CLI 支持 `--model` 则传入（与 Multica session/set_model 语义对齐的简化）
 */
export function parseGrokLine(
  line: string,
  onEvent: (e: AgentEvent) => void,
  ctx?: { providerSessionId?: string | null; usage?: any },
): void {
  const t = line.trim();
  if (!t) return;
  // ACP / JSON-RPC 行
  if (t.startsWith('{')) {
    let parsedJson = false;
    let j: Record<string, unknown> = {};
    try {
      j = JSON.parse(t) as Record<string, unknown>;
      parsedJson = true;
    } catch {
      /* fall through plain text */
    }
    if (parsedJson) {
      // DS1 / Slice 60: Session ID extraction
      const sid = (j.session_id ?? j.sessionId ?? j.id) as string | undefined;
      if (typeof sid === 'string' && sid.trim() && ctx) {
        ctx.providerSessionId = sid.trim();
      }

      // Slice 60 顺手：usage 尽力（result / params / 顶层）
      if (ctx) {
        const fromTop = extractTokenUsage(j) ?? extractTokenUsage(j.usage);
        if (fromTop) {
          ctx.usage = mergeUsage(ctx.usage ?? null, fromTop);
        }
        if (j.result && typeof j.result === 'object') {
          const ru = extractTokenUsage(j.result) ?? extractTokenUsage((j.result as Record<string, unknown>).usage);
          if (ru) ctx.usage = mergeUsage(ctx.usage ?? null, ru);
        }
      }

      // notifications/message 或 stream
      const method = typeof j.method === 'string' ? j.method : '';
      const params = (j.params ?? {}) as Record<string, unknown>;
      if (method.includes('session/update') || method.includes('message')) {
        const content =
          (params.content as string | undefined) ||
          (params.text as string | undefined) ||
          '';
        if (content) {
          onEvent({ type: 'message', role: 'assistant', text: content });
        }
        const tool = params.tool as { name?: string } | undefined;
        if (tool?.name) {
          onEvent({ type: 'tool_start', name: tool.name, args: params });
        }
        // tool_end 若 params 带 result/output
        if (tool?.name && (params.result != null || params.output != null)) {
          onEvent({
            type: 'tool_end',
            name: tool.name,
            result:
              typeof params.result === 'string'
                ? params.result
                : typeof params.output === 'string'
                  ? params.output
                  : JSON.stringify(params.result ?? params.output ?? '').slice(0, 4000),
          });
        }
        return;
      }
      if (j.result && typeof j.result === 'object') {
        const r = j.result as Record<string, unknown>;
        if (typeof r.output === 'string' && r.output) {
          onEvent({ type: 'message', role: 'assistant', text: r.output });
        }
      }
      return;
    }
  }
  // 纯文本 stdout 行（grok print 模式）：模型输出 → assistant message（G1-2：
  // 此前只发 log 不落库，run 详情永远看不到 grok 的回复）
  if (t.length < 4000) {
    onEvent({ type: 'message', role: 'assistant', text: t.slice(0, 500) });
  }
}

/**
 * 构建 grok argv（G1-2 fail-closed：`-p`/`--model`/`--effort`/`--resume` 均为**顶层** flag，
 * 实测 grok 0.2.118 不接受 `agent` 子命令后的位置 prompt / `-p` / `--resume`——
 * 旧实现（`grok agent --always-approve -p <prompt>`）在本机 100% 失败）。
 *
 * 诚实性（2026-08-02 G1-2）：
 * - supportsSessionResume=false：本仓未实现 ACP stdio 客户端，`--resume` 不注入
 * - 执行形态 = 顶层 `grok --no-auto-update -p <prompt>` 打印模式（实测可用）；
 *   fallback 仅去掉 --model/--effort（老版本 flag 集差异），不再用 `agent` 子命令
 */
export function buildGrokAgentArgs(
  input: Pick<
    ExecutionInput,
    'model' | 'thinkingLevel' | 'prompt' | 'resumeSessionId' | 'customArgs'
  >,
  opts: { print: boolean },
): string[] {
  const args = ['--no-auto-update'];
  if (opts.print) {
    // `-p` 是 `--single <PROMPT>` 的别名：prompt 必须紧跟 -p 作为其值（实测 0.2.118）
    args.push('-p', input.prompt);
  } else {
    args.push(input.prompt);
  }
  const model = input.model?.trim();
  if (model) args.push('--model', model);
  const effort = input.thinkingLevel?.trim();
  if (effort) args.push('--effort', effort);
  // G3-4b：custom_args 追加 argv 尾（grok 顶层 flag 形态，追加安全）
  const customArgs = input.customArgs?.length ? input.customArgs : [];
  args.push(...customArgs);
  return args;
}

/** 尝试 `-p` 打印模式；失败则返回 null 让调用方降级 */
async function tryPrintMode(
  bin: string,
  input: ExecutionInput,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<ExecutionResult | null> {
  const args = buildGrokAgentArgs(input, { print: true });
  const opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {};
  if (input.timeoutMs) opts.timeoutMs = input.timeoutMs;
  // G3-4b：agent.env_vars 显式覆盖子进程 env
  if (input.envVars) opts.env = input.envVars;
  const result = await spawnLineProcess(
    bin,
    args,
    input.cwd,
    signal,
    onEvent,
    (line, oe, ctx) => parseGrokLine(line, oe, ctx),
    undefined,
    opts,
  );
  // 若 CLI 不认 -p，常以非 0 退出且 stderr 含 unknown/usage
  if (
    result.exitReason === 'failed' &&
    /unknown|unrecognized|usage|invalid/i.test(result.error ?? '')
  ) {
    return null;
  }
  return result;
}

export class GrokBackend implements RuntimeBackend {
  readonly id = 'grok' as const;
  readonly label = 'Grok Build';
  /**
   * G1-2 fail-closed（2026-08-02）：false。
   * 本仓无 ACP stdio 客户端；A9 的 true 声明 + `--resume` 注入在本机 grok 0.2.118
   * 上不仅不生效，还让每次执行直接失败（`--resume` 不是 `agent` 子命令选项）。
   * 恢复 ACP（`grok agent stdio`，Multica grok.go 蓝图）前保持 false，UI 诚实标注。
   */
  readonly supportsSessionResume = false;

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

    onEvent({ type: 'log', text: '[grok] starting Grok Build CLI…' });

    // 1) 打印模式（顶层 `-p`，实测可用；最贴近 headless）
    const printed = await tryPrintMode(det.path, input, onEvent, signal);
    if (printed) return printed;

    // 2) 降级：-p prompt 但去掉 --model/--effort（老版本 flag 集差异兜底）
    const slim: string[] = ['--no-auto-update', '-p', input.prompt];
    // G3-4b：降级形态同样注入 custom_args（用户显式参数不因降级丢失）
    const customArgs = input.customArgs?.length ? input.customArgs : [];
    slim.push(...customArgs);
    const fallbackOpts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {};
    if (input.timeoutMs) fallbackOpts.timeoutMs = input.timeoutMs;
    // G3-4b：agent.env_vars 显式覆盖子进程 env
    if (input.envVars) fallbackOpts.env = input.envVars;

    const fallback = await spawnLineProcess(
      det.path,
      slim,
      input.cwd,
      signal,
      onEvent,
      (line, oe, ctx) => parseGrokLine(line, oe, ctx),
      undefined,
      fallbackOpts,
    );

    if (fallback.exitReason === 'completed' && fallback.finalText.trim()) {
      return fallback;
    }

    // 3) 最后：stdio 提示（本仓未实现完整 ACP 客户端）
    if (fallback.exitReason === 'failed') {
      return {
        finalText: stripAnsi(fallback.finalText || ''),
        exitReason: 'failed',
        error:
          (fallback.error ?? 'grok 执行失败') +
          '。完整 ACP stdio（session/new + prompt）见 Multica grok.go；请确认已 `grok login` 或设置 XAI_API_KEY。',
      };
    }
    return fallback;
  }
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

// silence unused if tree-shaken
void spawn;
