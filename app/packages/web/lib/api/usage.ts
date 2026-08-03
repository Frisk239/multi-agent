'use client';
/**
 * O3 拆分：usage 域 hooks（原 lib/api.ts 3284-3298 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
import type {
  TokenUsageAnalyticsResponse,
} from '@ma/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API, errMessage, apiError } from './http';

// —— Slice 15 (S3) + Slice 28: Token 成本归因 hooks ——
export function useTokenUsageAnalytics(
  days = 30,
  groupBy: 'agent' | 'project' | 'day' | 'issue' = 'agent',
) {
  return useQuery<TokenUsageAnalyticsResponse>({
    queryKey: ['token-usage-analytics', days, groupBy],
    queryFn: async () => {
      const res = await apiFetch(`${API}/analytics/token-usage?days=${days}&groupBy=${groupBy}`);
      if (!res.ok) throw new Error(await apiError(res, '加载 Token 成本数据失败'));
      return res.json();
    },
  });
}

