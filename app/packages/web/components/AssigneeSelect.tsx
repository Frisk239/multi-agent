'use client';
import { useAgents, useUpdateIssue } from '@/lib/api';

export function AssigneeSelect({
  issueId,
  currentAgentId,
}: {
  issueId: string;
  currentAgentId: string | null;
}) {
  const { data: agents = [] } = useAgents();
  const update = useUpdateIssue();

  function onChange(value: string) {
    if (value === '') {
      if (!confirm('清除指派并停止当前运行？')) return;
      update.mutate({ id: issueId, input: { assignee: null } });
      return;
    }
    const ag = agents.find((a) => a.id === value);
    if (!ag) return;
    // spec N10：指派 agent 前 confirm；展示 runtime 标签
    if (!confirm(`将用 ${ag.runtime} 启动 ${ag.name}，可随时停止。继续？`)) return;
    update.mutate({ id: issueId, input: { assignee: { type: 'agent', id: ag.id } } });
  }

  return (
    <select
      value={currentAgentId ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label="指派 agent"
      className="assignee-select"
    >
      <option value="">未指派</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {a.runtime}
        </option>
      ))}
    </select>
  );
}
