import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Issue, CreateIssueInput, UpdateIssueInput } from '@ma/shared';

const API = 'http://localhost:3001/api/issues';

export function useIssues() {
  return useQuery<Issue[]>({
    queryKey: ['issues'],
    queryFn: async () => {
      const res = await fetch(API);
      if (!res.ok) throw new Error('加载失败');
      return res.json();
    },
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIssueInput) => {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('创建失败');
      return res.json() as Promise<Issue>;
    },
    // 不做乐观更新——POST 响应 + WS issue:created 会处理（避免重复）
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateIssueInput }) => {
      const res = await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('更新失败');
      return res.json() as Promise<Issue>;
    },
    // 拖拽乐观更新在组件层用 onMutate 处理（见 KanbanBoard）
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
  });
}
