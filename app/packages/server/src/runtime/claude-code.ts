import type {
  RuntimeBackend,
  DetectResult,
  ExecutionInput,
  AgentEvent,
  ExecutionResult,
} from './types.js';
import { resolveCmd, versionOf } from './detect-path.js';
import { spawnLineProcess, type LineContext } from './spawn-line.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// parseClaudeLine —— 对齐 multica claude.go 的 claudeSDKMessage 解析（spike 实测验证）：
//   {"type":"system","subtype":"init",...}           → status
//   {"type":"assistant","message":{content:[...]}}   → text / tool_use block
//   {"type":"result","result":"<finalText>",...}     → 覆盖 ctx.resultText
// 字段映射依据 multica server/pkg/agent/claude.go:162-203 + 本机 spike。
function parseClaudeLine(
  line: string,
  onEvent: (e: AgentEvent) => void,
  ctx: LineContext,
): void {
  let j: Record<string, any>;
  try {
    j = JSON.parse(line);
  } catch {
    return; // 非 JSON 行忽略
  }
  switch (j.type) {
    case 'system':
      // init 心跳，仅作 progress 提示
      onEvent({ type: 'log', text: `[claude] ${j.subtype ?? 'system'}` });
      break;
    case 'assistant': {
      // message.content[] —— 对齐 multica handleAssistant
      const blocks = j.message?.content;
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
      const blocks = j.message?.content;
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (b.type === 'tool_result') {
            onEvent({
              type: 'tool_end',
              name: 'tool',
              result: typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '').slice(0, 4000),
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
      break;
  }
}

export class ClaudeCodeBackend implements RuntimeBackend {
  readonly id = 'claude-code' as const;
  readonly label = 'Claude Code';

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
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];

    // S05 MCP 注入（spec §7.2 R3）：mcpServers JSON → 写临时文件 → --mcp-config argv。
    // claude-code 的 --mcp-config 接受 {"mcpServers": {<name>: {...}}} 格式（object，spike 确认）。
    // agent.mcpServers 存的也是 object 格式 {<name>: {type,command,args,env}}——
    // 前端编辑/存储/注入统一 object，注入边界无需转换（impl-3 修正：删掉多余的 array→object 转换）。
    let mcpTmpPath: string | null = null;
    if (input.mcpServers) {
      try {
        const parsed = JSON.parse(input.mcpServers);
        // 存的已是 {<name>: {...}}，直接包成 claude 要的 {mcpServers: {...}}
        const config = JSON.stringify({ mcpServers: parsed });
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
      return await spawnLineProcess(
        det.path,
        args,
        input.cwd,
        signal,
        onEvent,
        parseClaudeLine,
        input.prompt, // stdinInput（S05 stdin 修复）
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
