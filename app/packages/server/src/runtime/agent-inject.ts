// G3-4b：agent.env_vars / agent.custom_args（DB 存 JSON 字符串）→ ExecutionInput 注入对象。
// 解析失败一律诚实降级为 null（不因单条坏数据砸掉 run）；空对象/空数组同 null。

export function parseAgentEnvVars(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const item of parsed) {
      if (item && typeof item.key === 'string' && item.key) {
        out[item.key] = typeof item.value === 'string' ? item.value : '';
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function parseAgentCustomArgs(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.map(String) : null;
  } catch {
    return null;
  }
}
