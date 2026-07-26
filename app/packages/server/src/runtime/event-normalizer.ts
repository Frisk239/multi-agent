import type { RuntimeEvent, RuntimeEventKind } from '@ma/shared';

export interface RawRuntimeEvent {
  id?: string;
  runId: string;
  type?: string;
  kind?: string;
  text?: string;
  body?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  duration?: number;
  createdAt?: number | string;
}

export function normalizeRuntimeEvent(raw: RawRuntimeEvent): RuntimeEvent {
  const id = raw.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const runId = raw.runId;
  const rawType = (raw.type || raw.kind || 'text').toLowerCase();

  let kind: RuntimeEventKind = 'text';
  let title: string | undefined;
  let content = raw.text || raw.body || '';
  let metadata: Record<string, unknown> | undefined;

  if (rawType.includes('tool_use') || rawType.includes('tool_call')) {
    kind = 'tool_use';
    title = raw.toolName ? `工具调用: ${raw.toolName}` : '工具调用';
    if (raw.input) {
      content = typeof raw.input === 'string' ? raw.input : JSON.stringify(raw.input, null, 2);
      metadata = { toolName: raw.toolName, input: raw.input };
    }
  } else if (rawType.includes('tool_result') || rawType.includes('tool_output') || rawType.includes('tool_end')) {
    kind = 'tool_result';
    title = raw.toolName ? `工具输出: ${raw.toolName}` : '工具输出';
    if (raw.output !== undefined || raw.duration !== undefined) {
      content = typeof raw.output === 'string' ? raw.output : JSON.stringify(raw.output, null, 2);
      metadata = { toolName: raw.toolName, output: raw.output, duration: raw.duration };
    }
  } else if (rawType.includes('thinking') || rawType.includes('thought')) {
    kind = 'thinking';
    title = '思考过程';
  } else if (rawType.includes('error')) {
    kind = 'error';
    title = '错误信息';
  } else if (rawType.includes('log') || rawType.includes('system')) {
    kind = 'system_log';
    title = '系统日志';
  }

  const timestamp = raw.createdAt
    ? typeof raw.createdAt === 'number'
      ? new Date(raw.createdAt).toISOString()
      : raw.createdAt
    : new Date().toISOString();

  return {
    id,
    runId,
    kind,
    title,
    content,
    metadata,
    timestamp,
  };
}
