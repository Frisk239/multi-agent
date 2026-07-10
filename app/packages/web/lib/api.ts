'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Issue,
  Comment,
  CreateIssueInput,
  UpdateIssueInput,
  CreateCommentInput,
  AgentSummary,
  SquadSummary,
} from '@ma/shared';

const API = 'http://localhost:3001/api';

export function useIssues() {
  return useQuery<Issue[]>({
    queryKey: ['issues'],
    queryFn: async () => {
      const res = await fetch(`${API}/issues`);
      if (!res.ok) throw new Error('加载失败');
      return res.json();
    },
  });
}

export function useIssue(id: string) {
  return useQuery<Issue>({
    queryKey: ['issue', id],
    queryFn: async () => {
      const res = await fetch(`${API}/issues/${id}`);
      if (!res.ok) throw new Error('issue 不存在');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useComments(issueId: string) {
  return useQuery<Comment[]>({
    queryKey: ['comments', issueId],
    queryFn: async () => {
      const res = await fetch(`${API}/issues/${issueId}/comments`);
      if (!res.ok) throw new Error('加载评论失败');
      return res.json();
    },
    enabled: !!issueId,
  });
}

export function useAgents() {
  return useQuery<AgentSummary[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch(`${API}/agents`);
      if (!res.ok) throw new Error('加载 agents 失败');
      return res.json();
    },
  });
}

export function useSquads() {
  return useQuery<SquadSummary[]>({
    queryKey: ['squads'],
    queryFn: async () => {
      const res = await fetch(`${API}/squads`);
      if (!res.ok) throw new Error('加载 squads 失败');
      return res.json();
    },
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIssueInput) => {
      const res = await fetch(`${API}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('创建失败');
      return res.json() as Promise<Issue>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
  });
}

export function useCreateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const res = await fetch(`${API}/issues/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('评论失败');
      return res.json() as Promise<Comment>;
    },
    // R9：不做乐观插入；写入 cache + 依赖 WS 幂等
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(['comments', issueId], (old) => {
        if (!old) return [comment];
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
    },
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateIssueInput }) => {
      const res = await fetch(`${API}/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('更新失败');
      return res.json() as Promise<Issue>;
    },
    // D12 + R2：只乐观 Issue 字段
    // 注意：assignee 在 UpdateIssueInput 无 label，乐观展开会破坏 Issue.assignee 的 label 形状；
    // 故 assignee 不参与乐观更新，等服务端返回带 label 的完整 Issue（onSuccess）落地。
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ['issues'] });
      await qc.cancelQueries({ queryKey: ['issue', id] });
      const prevList = qc.getQueryData<Issue[]>(['issues']);
      const prevOne = qc.getQueryData<Issue>(['issue', id]);
      const { assignee: _dropAssignee, ...patch } = input;
      qc.setQueryData<Issue[]>(['issues'], (old) =>
        old?.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      );
      if (prevOne) {
        qc.setQueryData<Issue>(['issue', id], { ...prevOne, ...patch });
      }
      return { prevList, prevOne };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['issues'], ctx.prevList);
      if (ctx?.prevOne) qc.setQueryData(['issue', id], ctx.prevOne);
    },
    onSuccess: (issue) => {
      qc.setQueryData<Issue[]>(['issues'], (old) =>
        old?.map((i) => (i.id === issue.id ? issue : i)),
      );
      qc.setQueryData(['issue', issue.id], issue);
      // 时间线条等 WS comment:created；也可 invalidate 兜底
      qc.invalidateQueries({ queryKey: ['comments', issue.id] });
    },
  });
}
