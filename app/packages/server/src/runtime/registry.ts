import type { RuntimeId } from '@ma/shared';
import type { RuntimeBackend } from './types.js';
import { ClaudeCodeBackend } from './claude-code.js';
import { OpencodeBackend } from './opencode.js';
import { CursorBackend } from './cursor.js';
import { GrokBackend } from './grok.js';

const list: RuntimeBackend[] = [
  new ClaudeCodeBackend(),
  new OpencodeBackend(),
  new CursorBackend(),
  new GrokBackend(),
];

export function getBackend(id: RuntimeId): RuntimeBackend {
  const b = list.find((x) => x.id === id);
  if (!b) throw new Error(`unknown runtime ${id}`);
  return b;
}

export function allBackends(): RuntimeBackend[] {
  return list;
}
