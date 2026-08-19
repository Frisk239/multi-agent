import type { RuntimeId } from '@ma/shared';
import type { RuntimeBackend } from './types.js';
import { ClaudeCodeBackend } from './claude-code.js';
import { OpencodeBackend } from './opencode.js';
import { CursorBackend } from './cursor.js';
import { GrokBackend } from './grok.js';
import { PiBackend } from './pi.js';

// G8-4a: production adapters intentionally expose no `preflight` yet. Their
// detect()/--version paths, Grok ACP initialization/authentication, and Pi RPC
// startup are not documented-safe readiness checks and must remain unverified.
const list: RuntimeBackend[] = [
  new ClaudeCodeBackend(),
  new OpencodeBackend(),
  new CursorBackend(),
  new GrokBackend(),
  new PiBackend(),
];

export function getBackend(id: RuntimeId): RuntimeBackend {
  const b = list.find((x) => x.id === id);
  if (!b) throw new Error(`unknown runtime ${id}`);
  return b;
}

export function allBackends(): RuntimeBackend[] {
  return list;
}
