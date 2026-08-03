/**
 * ACP（Agent Client Protocol）MCP 服务器注入。
 *
 * 蓝图：multica `server/pkg/agent/hermes.go:1986 buildACPMcpServers` +
 * `convertACPMcpServer` + `filterACPMcpServersByCapability` + `grok.go:317`
 * —— 把 agent 的 Claude 风格 mcp_config（object of objects）翻译成
 * ACP session/new|load 期望的**数组形态**，并按 initialize 声明的
 * `agentCapabilities.mcpCapabilities` 过滤远程 transport（stdio 总通过）。
 *
 * ACP 协议要求：客户端不得发送 agent 未声明的 mcpServers transport 类型
 * （https://agentclientprotocol.com/protocol/initialization）——违规会让
 * 整个 session/new 被 JSON-RPC error 拒绝（Hermes/Kimi 实测），所以
 * fail closed + 按能力过滤而不是静默丢弃。
 *
 * 安全：MCP 条目常含 API token（env/headers）——本文件不写日志。
 */

export interface AcpMcpServerEntry {
  name: string;
  command: string;
  args: string[];
  /** ACP wire shape：env 是 `{name, value}[]`（不是 object） */
  env?: { name: string; value: string }[];
}

export interface AcpMcpServerRemoteEntry {
  name: string;
  url: string;
  headers?: { name: string; value: string }[];
}

export type AcpMcpServer = AcpMcpServerEntry | AcpMcpServerRemoteEntry;

export interface AcpMcpCapabilities {
  http: boolean;
  sse: boolean;
}

/**
 * 从 initialize 响应提取 mcpCapabilities。
 * 对齐 multica hermes.go:2118 extractACPMcpCapabilities：未声明 = 全不支持。
 */
export function extractAcpMcpCapabilities(initResult: unknown): AcpMcpCapabilities {
  const r = initResult as {
    agentCapabilities?: { mcpCapabilities?: { http?: unknown; sse?: unknown } };
  };
  return {
    http: Boolean(r?.agentCapabilities?.mcpCapabilities?.http),
    sse: Boolean(r?.agentCapabilities?.mcpCapabilities?.sse),
  };
}

/**
 * Claude 风格 `{"mcpServers": {name: entry}}` → ACP array shape。
 * - stdio 条目：`{ name, command, args, env: [{name,value}] }`
 * - 远程条目：`{ name, url, headers: [{name,value}] }`，type 归一化
 *   （sse / http / streamable-http → http；未知远程类型降级 http——
 *   不认识的 agent 会拒整个 session/new 并浮出真实错误，对齐 multica）
 * - malformed JSON / 无法分类条目 → throw（fail closed，不静默丢 MCP）
 * - 条目按 name 排序 → 线上请求确定性（对齐 multica 可复现性注释）
 */
export function buildAcpMcpServers(rawConfig: string | null | undefined): AcpMcpServer[] {
  const trimmed = (rawConfig ?? '').trim();
  if (!trimmed || trimmed === 'null') return [];

  let parsed: { mcpServers?: Record<string, unknown> };
  try {
    parsed = JSON.parse(trimmed) as { mcpServers?: Record<string, unknown> };
  } catch (err) {
    throw new Error(`parse mcp_config json: ${err instanceof Error ? err.message : String(err)}`);
  }
  const servers = parsed.mcpServers;
  if (!servers || Object.keys(servers).length === 0) return [];

  const names = Object.keys(servers).sort();
  const out: AcpMcpServer[] = [];
  for (const name of names) {
    out.push(convertAcpMcpServer(name, servers[name]));
  }
  return out;
}

function convertAcpMcpServer(name: string, raw: unknown): AcpMcpServer {
  const entry = (typeof raw === 'object' && raw !== null ? raw : {}) as {
    type?: string;
    command?: string;
    args?: unknown;
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };

  const command = (entry.command ?? '').trim();
  const url = (entry.url ?? '').trim();

  if (command) {
    const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
    const env = entry.env ? toNameValueArray(entry.env) : [];
    return { name, command, args, env };
  }

  if (url) {
    const t = (entry.type ?? '').toLowerCase().trim();
    const type = t === 'sse' ? 'sse' : 'http'; // 未知/空/http/streamable-http → http
    const headers = entry.headers ? toNameValueArray(entry.headers) : [];
    return {
      name,
      url,
      ...(type === 'sse' ? { type: 'sse' as const } : {}),
      headers,
    } as AcpMcpServerRemoteEntry;
  }

  throw new Error(`convert MCP entry "${name}": no command and no url`);
}

function toNameValueArray(map: Record<string, string>): { name: string; value: string }[] {
  return Object.keys(map)
    .sort()
    .map((k) => ({ name: k, value: String(map[k]) }));
}

/**
 * 按 initialize 声明的 mcpCapabilities 过滤：stdio 条目总通过；
 * 远程（url）条目只保留 agent 声明的 transport。对齐 multica
 * hermes.go:2146 filterACPMcpServersByCapability。
 */
export function filterAcpMcpServersByCapability(
  servers: AcpMcpServer[],
  caps: AcpMcpCapabilities,
  backend: string,
  warn: (msg: string) => void,
): AcpMcpServer[] {
  if (servers.length === 0) return servers;
  const filtered: AcpMcpServer[] = [];
  for (const server of servers) {
    if ('command' in server) {
      filtered.push(server);
      continue;
    }
    const isSse = 'type' in server && server.type === 'sse';
    const supported = isSse ? caps.sse : caps.http;
    if (supported) {
      filtered.push(server);
    } else {
      warn(
        `${backend}: MCP server "${server.name}" 使用 ${isSse ? 'sse' : 'http'} transport，` +
          `运行时未声明支持（mcpCapabilities）——已跳过，其余 MCP 正常注入`,
      );
    }
  }
  return filtered;
}
