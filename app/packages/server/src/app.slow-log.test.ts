/**
 * G6-8：请求级慢日志纯函数直测（原零测试）。
 * 覆盖：阈值边界（999 不记 / 1000 记 / 1001 记）、条目字段、耗时取整。
 */
import { describe, expect, it } from 'vitest';
import { buildSlowRequestLog, SLOW_REQUEST_THRESHOLD_MS } from './app.js';

const base = { method: 'GET', path: '/api/runs', durationMs: 0, statusCode: 200 };

describe('buildSlowRequestLog (G6-8)', () => {
  it('阈值常量 = 1000ms（与 roadmap 口径一致）', () => {
    expect(SLOW_REQUEST_THRESHOLD_MS).toBe(1_000);
  });

  it('999ms（阈值下 1ms）→ null 不记', () => {
    expect(buildSlowRequestLog({ ...base, durationMs: 999 })).toBeNull();
  });

  it('1000ms（恰达阈值）→ 记录', () => {
    const entry = buildSlowRequestLog({ ...base, durationMs: 1000 });
    expect(entry).not.toBeNull();
    expect(entry!.durationMs).toBe(1000);
  });

  it('1001ms → 记录，字段透传 method/path/statusCode', () => {
    const entry = buildSlowRequestLog({
      method: 'POST',
      path: '/api/issues?project=x',
      durationMs: 2500.6,
      statusCode: 201,
    });
    expect(entry).toEqual({
      method: 'POST',
      path: '/api/issues?project=x',
      durationMs: 2501, // 四舍五入
      statusCode: 201,
    });
  });

  it('慢请求含 query 串（path 原样透传，方便复现）', () => {
    const entry = buildSlowRequestLog({
      ...base,
      path: '/api/settings/status?with=runtime-detect',
      durationMs: 3200,
    });
    expect(entry!.path).toBe('/api/settings/status?with=runtime-detect');
  });
});
