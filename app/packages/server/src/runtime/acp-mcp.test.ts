import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAcpMcpServers,
  extractAcpMcpCapabilities,
  filterAcpMcpServersByCapability,
} from './acp-mcp.js';

/**
 * Q2 · MCP 经 ACP 注入（学 multica hermes.go:1986 buildACPMcpServers +
 * convertACPMcpServer + filterACPMcpServersByCapability）：
 * - Claude 风格 {"mcpServers": {...}} → ACP array shape（env/headers 为 {name,value}[]）
 * - stdio 与远程（url）条目分类；type 归一化 sse/http
 * - malformed / 无法分类 → throw（fail closed，不静默丢 MCP）
 * - 按 initialize mcpCapabilities 过滤远程 transport（stdio 总通过）
 */

describe('buildAcpMcpServers', () => {
  it('空 / null / undefined → []', () => {
    expect(buildAcpMcpServers(undefined)).toEqual([]);
    expect(buildAcpMcpServers(null)).toEqual([]);
    expect(buildAcpMcpServers('')).toEqual([]);
    expect(buildAcpMcpServers('null')).toEqual([]);
    expect(buildAcpMcpServers('  ')).toEqual([]);
  });

  it('stdio 条目 → { name, command, args, env:[{name,value}] }（env 数组形态）', () => {
    const out = buildAcpMcpServers(
      JSON.stringify({
        mcpServers: {
          fs: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
            env: { API_KEY: 'sk-123', REGION: 'cn' },
          },
        },
      }),
    );
    expect(out).toEqual([
      {
        name: 'fs',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        env: [
          { name: 'API_KEY', value: 'sk-123' },
          { name: 'REGION', value: 'cn' },
        ],
      },
    ]);
  });

  it('远程条目 → { name, url, headers }，type 归一化 http（streamable-http/未知 → http）', () => {
    const out = buildAcpMcpServers(
      JSON.stringify({
        mcpServers: {
          web: {
            type: 'streamable-http',
            url: 'https://mcp.example.com',
            headers: { Authorization: 'Bearer x' },
          },
          events: {
            type: 'sse',
            url: 'https://mcp.example.com/sse',
          },
        },
      }),
    );
    expect(out).toEqual([
      {
        name: 'events',
        url: 'https://mcp.example.com/sse',
        type: 'sse',
        headers: [],
      },
      {
        name: 'web',
        url: 'https://mcp.example.com',
        headers: [{ name: 'Authorization', value: 'Bearer x' }],
      },
    ]);
  });

  it('按 name 排序 → 线上请求确定性', () => {
    const out = buildAcpMcpServers(
      JSON.stringify({
        mcpServers: {
          b: { command: 'b' },
          a: { command: 'a' },
        },
      }),
    );
    expect(out.map((s) => s.name)).toEqual(['a', 'b']);
  });

  it('malformed JSON → throw（fail closed）', () => {
    expect(() => buildAcpMcpServers('{not json')).toThrow(/parse mcp_config json/);
  });

  it('条目无 command 无 url → throw', () => {
    expect(() =>
      buildAcpMcpServers(JSON.stringify({ mcpServers: { x: { type: 'stdio' } } })),
    ).toThrow(/no command and no url/);
  });
});

describe('extractAcpMcpCapabilities', () => {
  it('声明 http 时提取；未声明 = 全不支持', () => {
    expect(
      extractAcpMcpCapabilities({
        agentCapabilities: { mcpCapabilities: { http: true } },
      }),
    ).toEqual({ http: true, sse: false });
    expect(extractAcpMcpCapabilities({})).toEqual({ http: false, sse: false });
    expect(extractAcpMcpCapabilities(null)).toEqual({ http: false, sse: false });
  });
});

describe('filterAcpMcpServersByCapability', () => {
  const warn = vi.fn();

  beforeEach(() => {
    warn.mockReset();
  });

  it('stdio 条目总通过；远程按声明过滤', () => {
    const servers = [
      { name: 'fs', command: 'npx', args: [] as string[] },
      { name: 'web', url: 'https://x', headers: [] as { name: string; value: string }[] },
      { name: 'events', url: 'https://x/sse', type: 'sse' as const, headers: [] as { name: string; value: string }[] },
    ];
    const out = filterAcpMcpServersByCapability(servers, { http: true, sse: false }, 'grok', warn);
    expect(out.map((s) => s.name)).toEqual(['fs', 'web']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('events');
    expect(warn.mock.calls[0][0]).toContain('sse transport');
  });

  it('全不支持时只留 stdio；空列表直接返回（不 warn）', () => {
    expect(
      filterAcpMcpServersByCapability(
        [{ name: 'web', url: 'https://x', headers: [] }],
        { http: false, sse: false },
        'grok',
        warn,
      ),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1); // web 被过滤时 warn 一次
    warn.mockClear();
    expect(filterAcpMcpServersByCapability([], { http: false, sse: false }, 'grok', warn)).toEqual(
      [],
    );
    expect(warn).not.toHaveBeenCalled(); // 空列表不触发
  });
});
