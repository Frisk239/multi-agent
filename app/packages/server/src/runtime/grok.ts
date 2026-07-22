import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, stripAnsi } from './spawn-line.js';
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
function parseGrokLine(
  line: string,
  onEvent: (e: AgentEvent) => void,
): void {
  const t = line.trim();
  if (!t) return;
  // ACP / JSON-RPC 行
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
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
        return;
      }
      if (j.result && typeof j.result === 'object') {
        const r = j.result as Record<string, unknown>;
        if (typeof r.output === 'string' && r.output) {
          onEvent({ type: 'message', role: 'assistant', text: r.output });
        }
      }
      return;
    } catch {
      /* fall through plain text */
    }
  }
  // 纯文本日志
  if (t.length < 4000) {
    onEvent({ type: 'log', text: `[grok] ${t.slice(0, 500)}` });
  }
}

/** 尝试 `-p` 打印模式；失败则返回 null 让调用方降级 */
async function tryPrintMode(
  bin: string,
  input: ExecutionInput,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<ExecutionResult | null> {
  const args = ['--no-auto-update', 'agent', '--always-approve', '-p'];
  const model = input.model?.trim();
  if (model) {
    args.push('--model', model);
  }
  args.push(input.prompt);
  const result = await spawnLineProcess(
    bin,
    args,
    input.cwd,
    signal,
    onEvent,
    (line, oe) => parseGrokLine(line, oe),
    undefined,
    input.timeoutMs ? { timeoutMs: input.timeoutMs } : undefined,
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

    // 1) 打印模式（最贴近 headless）
    const printed = await tryPrintMode(det.path, input, onEvent, signal);
    if (printed) return printed;

    // 2) 降级：agent --always-approve + prompt 作参数（部分版本）
    const args = ['--no-auto-update', 'agent', '--always-approve'];
    const model = input.model?.trim();
    if (model) args.push('--model', model);
    // DS4：best-effort --effort（Multica grok 模式）
    const effort = input.thinkingLevel?.trim();
    if (effort) args.push('--effort', effort);
    args.push(input.prompt);

    const fallback = await spawnLineProcess(
      det.path,
      args,
      input.cwd,
      signal,
      onEvent,
      (line, oe) => parseGrokLine(line, oe),
      undefined,
      input.timeoutMs ? { timeoutMs: input.timeoutMs } : undefined,
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
