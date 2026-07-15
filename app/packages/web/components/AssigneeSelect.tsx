'use client';
import { useAgents, useSquads, useUpdateIssue } from '@/lib/api';
import type { Assignee } from '@ma/shared';

// S04：AssigneeSelect 支持选 agent + squad（spec §5.1，纠正 R7 假设错误）。
// value 用前缀编码区分类型：agent:<id> / squad:<id> / ""（未指派）。
export function AssigneeSelect({
  issueId,
  currentAssignee,
}: {
  issueId: string;
  currentAssignee: Assignee;
}) {
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const update = useUpdateIssue();

  // 当前选中值（按 type 编码）；member 指派当未指派处理（不展示）
  const currentValue =
    currentAssignee?.type === 'agent'
      ? `agent:${currentAssignee.id}`
      : currentAssignee?.type === 'squad'
        ? `squad:${currentAssignee.id}`
        : '';

  function onChange(value: string) {
    if (value === '') {
      if (!confirm('清除指派并停止当前运行？')) return;
      update.mutate({ id: issueId, input: { assignee: null } });
      return;
    }
    if (value.startsWith('agent:')) {
      const ag = agents.find((a) => a.id === value.slice('agent:'.length));
      if (!ag) return;
      // spec N10：指派 agent 前 confirm；展示 runtime 标签
      if (!confirm(`将用 ${ag.runtime} 启动 ${ag.name}，可随时停止。继续？`)) return;
      update.mutate({
        id: issueId,
        input: { assignee: { type: 'agent', id: ag.id } },
      });
      return;
    }
    if (value.startsWith('squad:')) {
      const sq = squads.find((s) => s.id === value.slice('squad:'.length));
      if (!sq) return;
      // S04：指派 squad 会触发 leader run（队长被执行 + briefing 委派）
      if (
        !confirm(
          `将启动小队「${sq.name}」：队长被执行并 briefing 委派成员。可随时停止。继续？`,
        )
      )
        return;
      update.mutate({
        id: issueId,
        input: { assignee: { type: 'squad', id: sq.id } },
      });
    }
  }

  return (
    <select
      value={currentValue}
      onChange={(e) => onChange(e.target.value)}
      aria-label="指派 agent 或小队"
      className="assignee-select"
    >
      <option value="">未指派</option>
      <optgroup label="智能体">
        {agents.map((a) => (
          <option key={a.id} value={`agent:${a.id}`}>
            {a.name} · {a.runtime}
          </option>
        ))}
      </optgroup>
      <optgroup label="小队">
        {squads.map((s) => (
          <option key={s.id} value={`squad:${s.id}`}>
            {s.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
