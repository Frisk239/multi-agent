import { describe, expect, it } from 'vitest';
import {
  inspectMcpEnvReferences,
  redactMcpConfig,
  resolveMcpServersEnv,
  validateMcpConfig,
} from './mcp-config.js';

describe('mcp config safety contract', () => {
  it('accepts the raw server map and canonicalizes the legacy wrapper', () => {
    const parsed = validateMcpConfig(
      JSON.stringify({
        mcpServers: {
          fs: { command: 'npx', args: ['server-filesystem'] },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(JSON.parse(parsed.canonical)).toEqual({
      fs: { command: 'npx', args: ['server-filesystem'] },
    });
  });

  it('rejects literal sensitive values and permits explicit env references', () => {
    const rejected = validateMcpConfig(
      JSON.stringify({
        github: { url: 'https://mcp.example.com', headers: { Authorization: 'Bearer sk-live' } },
      }),
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toMatch(/env:NAME/);

    const parsed = validateMcpConfig(
      JSON.stringify({
        github: { url: 'https://mcp.example.com', headers: { Authorization: '${env:GITHUB_TOKEN}' } },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(resolveMcpServersEnv(JSON.parse(parsed.canonical), { GITHUB_TOKEN: 'Bearer test' })).toEqual({
      github: { url: 'https://mcp.example.com', headers: { Authorization: 'Bearer test' } },
    });

    for (const unsafeValue of [42, false, null, { nested: 'not-a-reference' }]) {
      const nonString = validateMcpConfig(
        JSON.stringify({ github: { apiKey: unsafeValue } }),
      );
      expect(nonString.ok).toBe(false);
    }
  });

  it('redacts secrets before returning config to the UI', () => {
    const redacted = redactMcpConfig(
      JSON.stringify({
        mcpServers: {
          github: {
            url: 'https://mcp.example.com',
            headers: { Authorization: 'Bearer sk-live', 'X-Trace': 'visible' },
          },
        },
      }),
    );
    expect(redacted).not.toBeNull();
    expect(JSON.parse(redacted!)).toEqual({
      mcpServers: {
        github: {
          url: 'https://mcp.example.com',
          headers: { Authorization: '[redacted]', 'X-Trace': 'visible' },
        },
      },
    });
  });

  it('preflights missing sensitive MCP env references before a backend writes config', () => {
    const inspected = inspectMcpEnvReferences(
      {
        github: {
          headers: {
            Authorization: '${env:G8_MISSING_GITHUB_TOKEN}',
            'X-Optional-Label': '${env:G8_OPTIONAL_LABEL}',
          },
        },
      },
      {},
    );
    expect(inspected.missingRequiredRefs).toEqual([
      {
        path: 'mcpServers.github.headers.Authorization',
        key: 'Authorization',
        envRef: 'G8_MISSING_GITHUB_TOKEN',
      },
    ]);
    expect(inspected.missingOptionalRefs).toEqual([
      {
        path: 'mcpServers.github.headers.X-Optional-Label',
        key: 'X-Optional-Label',
        envRef: 'G8_OPTIONAL_LABEL',
      },
    ]);
  });
});
