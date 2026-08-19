import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, type LineContext } from './spawn-line.js';
import { parseUsageFromResultLine } from './usage-parse.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parseMcpServers, resolveMcpServersEnv } from './mcp-config.js';
import { tmpdir } from 'node:os';
import { scrubAndTruncateToolResult } from './secret-scrubber.js';
type ClaudeEvent =
  | { type: 'system'; subtype?: string; session_id?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'assistant'; message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> }; session_id?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'user'; message?: { content?: Array<{ type: string; tool_name?: string; name?: string; content?: unknown }> }; session_id?: string; sessionId?: string; [k: string]: unknown }
  | { type: 'result'; result?: unknown; session_id?: string; sessionId?: string; usage?: unknown; modelUsage?: unknown; model_usage?: unknown; [k: string]: unknown }
  | { type: string; session_id?: string; sessionId?: string; [k: string]: unknown };

function isClaudeEvent(val: unknown): val is ClaudeEvent {
  return typeof val === 'object' && val !== null && 'type' in val && typeof (val as Record<string, unknown>).type === 'string';
}

function pickSessionId(j: ClaudeEvent): string | null {
  const raw = j.session_id ?? j.sessionId;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

function safeStringifyResult(content: unknown): string {
  return scrubAndTruncateToolResult(content);
}

function parseClaudeLine(
  line: string,
  onEvent: (e: AgentEvent) => void,
  ctx: LineContext,
): void {
  let j: unknown;
  try {
    j = JSON.parse(line);
  } catch {
    return; // 非 JSON 行忽略
  }
  if (!isClaudeEvent(j)) return;
  // DS1：init/result 等行可能带 session_id
  const sid = pickSessionId(j);
  if (sid) ctx.providerSessionId = sid;

  switch (j.type) {
    case 'system':
      // init 心跳，仅作 progress 提示
      onEvent({
        type: 'log',
        text: sid
          ? `[claude] ${j.subtype ?? 'system'} session=${sid.slice(0, 12)}…`
          : `[claude] ${j.subtype ?? 'system'}`,
      });
      break;
    case 'assistant': {
      // message.content[] —— 对齐 multica handleAssistant
      const blocks = (j.message as any)?.content;
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (b.type === 'text' && typeof b.text === 'string' && b.text) {
            onEvent({ type: 'message', role: 'assistant', text: b.text });
          } else if (b.type === 'tool_use' && typeof b.name === 'string') {
            onEvent({ type: 'tool_start', name: b.name, args: b.input });
          }
        }
      }
      break;
    }
    case 'user': {
      // tool_result 回执（对齐 multica handleUser）
      const blocks = (j.message as any)?.content;
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (b.type === 'tool_result') {
            onEvent({
              type: 'tool_end',
              name: b.tool_name ?? b.name ?? 'tool',
              result: safeStringifyResult(b.content),
            });
          }
        }
      }
      break;
    }
    case 'result':
      // 终态行：.result 是人读 finalText（对齐 multica claude.go:181 output.Reset+WriteString）
      if (typeof j.result === 'string') {
        ctx.resultText = j.result;
      }
      // DS4：usage / modelUsage 尽力解析
      {
        const usage = parseUsageFromResultLine(j);
        if (usage) ctx.usage = usage;
      }
      break;
  }
}

/**
 * G6-3：claude-code argv 纯函数构造（可直测；无 I/O）。
 * base：`-p --output-format stream-json --verbose`（S05 stdin 修复：prompt 走 stdin）。
 * model/thinkingLevel/resumeSessionId 空则省略（CLI 默认）；customArgs 追加尾部。
 */
export function buildClaudeArgv(opts: {
  model?: string | null;
  thinkingLevel?: string | null;
  resumeSessionId?: string | null;
  customArgs?: string[] | null;
}): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose'];
  const model = opts.model?.trim();
  if (model) args.push('--model', model);
  // DS4：thinking → claude --effort（CLI 不支持时失败体现在 run error，用户可清空）
  const effort = opts.thinkingLevel?.trim();
  if (effort) args.push('--effort', effort);
  // DS1：真 session resume（Multica claude.go --resume）
  const resume = opts.resumeSessionId?.trim();
  if (resume) args.push('--resume', resume);
  const customArgs = opts.customArgs?.length ? opts.customArgs : [];
  args.push(...customArgs);
  return args;
}

export class ClaudeCodeBackend implements RuntimeBackend {
  readonly id = 'claude-code' as const;
  readonly label = 'Claude Code';
  /** Slice 50 / DS1：真 --resume + session_id 解析可观测 */
  readonly supportsSessionResume = true;
  readonly supportsMcpConfig = true;
  readonly supportsCustomArgs = true;
  readonly supportsThinkingLevel = true;

  async detect(): Promise<DetectResult> {
    const path = await resolveCmd('CLAUDE_PATH', ['claude']);
    if (!path) return { installed: false, version: null, path: null };
    return { installed: true, version: await versionOf(path), path };
  }

  async execute(
    input: ExecutionInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult> {
    const det = await this.detect();
    if (!det.path) return { finalText: '', exitReason: 'failed', error: 'claude CLI 未安装' };
    // S05 stdin 修复（spec §8）：claude -p 不带 prompt 参数时从 stdin 读
    // （spike 钉死：echo "..." | claude -p --output-format stream-json --verbose 跑通）。
    // argv 不含 prompt，prompt 经 spawnLineProcess 的 stdinInput → child.stdin pipe 传。
    const args = buildClaudeArgv({
      model: input.model,
      thinkingLevel: input.thinkingLevel,
      resumeSessionId: input.resumeSessionId,
      customArgs: input.customArgs,
    });

    // S05 MCP 注入（spec §7.2 R3）：mcpServers JSON → 写临时文件 → --mcp-config argv。
    // claude-code 的 --mcp-config 接受 {"mcpServers": {<name>: {...}}} 格式（object，spike 确认）。
    // agent.mcpServers 存的也是 object 格式 {<name>: {type,command,args,env}}——
    // 前端编辑/存储/注入统一 object，注入边界无需转换（impl-3 修正：删掉多余的 array→object 转换）。
    let mcpTmpPath: string | null = null;
    if (input.mcpServers) {
      try {
        const parsed = parseMcpServers(input.mcpServers);
        // 存储/编辑使用 canonical server map，Claude 原生需要外层 mcpServers。
        const config = JSON.stringify({ mcpServers: resolveMcpServersEnv(parsed) });
        mcpTmpPath = join(tmpdir(), `ma-mcp-${input.runId}.json`);
        writeFileSync(mcpTmpPath, config);
        args.push('--mcp-config', mcpTmpPath);
      } catch {
        // JSON 解析失败：忽略 MCP（降级不报错，spec §7.3）
        mcpTmpPath = null;
      }
    }

    // try/finally 包临时文件清理（R3）：即使 abort 兜底（spawn-line 5s 强制 finish）
    // execute 的 await 返回后 finally 也能清理，防资源泄露。
    try {
      const opts: {
        timeoutMs?: number;
        env?: NodeJS.ProcessEnv;
        onProcessStarted?: (pid: number) => void;
      } = {};
      if (input.timeoutMs) opts.timeoutMs = input.timeoutMs;
      // G3-4b：agent.env_vars 显式覆盖子进程 env
      if (input.envVars) opts.env = input.envVars;
      if (input.onProcessStarted) opts.onProcessStarted = input.onProcessStarted;
      return await spawnLineProcess(
        det.path,
        args,
        input.cwd,
        signal,
        onEvent,
        parseClaudeLine,
        input.prompt, // stdinInput（S05 stdin 修复）
        opts,
      );
    } finally {
      if (mcpTmpPath) {
        try {
          unlinkSync(mcpTmpPath);
        } catch {
          /* ignore：文件可能已被清或 spawn 失败前未创建 */
        }
      }
    }
  }
}
