'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  useAgents,
  useAgentsReadinessMap,
  useSquads,
  useUpdateIssue,
} from '@/lib/api';
import type { AgentReadiness, Assignee } from '@ma/shared';

function readinessHint(rd: AgentReadiness | null | undefined): string {
  if (!rd) return '';
  if (rd.status === 'ready') return 'ready';
  if (rd.status === 'busy') return 'busy';
  if (rd.status === 'cwd_missing') return 'cwd 未配置';
  if (rd.status === 'runtime_missing') return 'runtime 缺失';
  return rd.status;
}

function readinessBlockMessage(
  name: string,
  rd: AgentReadiness | null | undefined,
): string | null {
  if (!rd) return null;
  if (rd.status === 'ready' || rd.status === 'busy') return null;
  if (rd.status === 'cwd_missing') {
    return `${name} 当前不可执行：未配置 MA_WORKSPACE_CWD。请先到「环境诊断」配置工作区目录。仍要指派吗？`;
  }
  if (rd.status === 'runtime_missing') {
    return `${name} 当前不可执行：runtime ${rd.runtime} 未检测到。请到「运行时」页确认 CLI。仍要指派吗？`;
  }
  return `${name} 就绪状态为 ${rd.status}${rd.detail ? `（${rd.detail}）` : ''}。仍要指派吗？`;
}

// S04 + readiness 提示：指派前展示/确认阻塞项（不硬拦截，可继续）
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

  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(agentIds);

  const currentValue =
    currentAssignee?.type === 'agent'
      ? `agent:${currentAssignee.id}`
      : currentAssignee?.type === 'squad'
        ? `squad:${currentAssignee.id}`
        : '';

  const currentAgentId =
    currentAssignee?.type === 'agent'
      ? currentAssignee.id
      : currentAssignee?.type === 'squad'
        ? squads.find((s) => s.id === currentAssignee.id)?.leaderId
        : undefined;
  const currentRd =
    currentAgentId != null ? readinessMap[currentAgentId] ?? null : null;

  function onChange(value: string) {
    if (value === '') {
      if (!confirm('清除指派并停止当前运行？')) return;
      update.mutate({ id: issueId, input: { assignee: null } });
      return;
    }
    if (value.startsWith('agent:')) {
      const ag = agents.find((a) => a.id === value.slice('agent:'.length));
      if (!ag) return;
      const rd = readinessMap[ag.id];
      const block = readinessBlockMessage(ag.name, rd);
      if (block) {
        if (!confirm(block)) return;
      } else if (!confirm(`将用 ${ag.runtime} 启动 ${ag.name}，可随时停止。继续？`)) {
        return;
      }
      update.mutate({
        id: issueId,
        input: { assignee: { type: 'agent', id: ag.id } },
      });
      return;
    }
    if (value.startsWith('squad:')) {
      const sq = squads.find((s) => s.id === value.slice('squad:'.length));
      if (!sq) return;
      const leaderId = sq.leaderId;
      const leaderRd = leaderId ? readinessMap[leaderId] : null;
      const leaderName = leaderId
        ? agents.find((a) => a.id === leaderId)?.name ?? '队长'
        : '队长';
      const block = readinessBlockMessage(`小队「${sq.name}」队长（${leaderName}）`, leaderRd);
      if (block) {
        if (!confirm(block)) return;
      } else if (
        !confirm(
          `将启动小队「${sq.name}」：队长被执行并 briefing 委派成员。可随时停止。继续？`,
        )
      ) {
        return;
      }
      update.mutate({
        id: issueId,
        input: { assignee: { type: 'squad', id: sq.id } },
      });
    }
  }

  return (
    <div className="assignee-select-wrap" data-testid="assignee-select-wrap">
      <select
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
        aria-label="指派 agent 或小队"
        className="assignee-select"
        data-testid="assignee-select"
      >
        <option value="">未指派</option>
        <optgroup label="智能体">
          {agents.map((a) => {
            const hint = readinessHint(readinessMap[a.id]);
            return (
              <option key={a.id} value={`agent:${a.id}`}>
                {a.name} · {a.runtime}
                {hint ? ` · ${hint}` : ''}
              </option>
            );
          })}
        </optgroup>
        <optgroup label="小队">
          {squads.map((s) => {
            const leaderHint = s.leaderId
              ? readinessHint(readinessMap[s.leaderId])
              : '';
            return (
              <option key={s.id} value={`squad:${s.id}`}>
                {s.name}
                {leaderHint ? ` · 队长 ${leaderHint}` : ''}
              </option>
            );
          })}
        </optgroup>
      </select>
      {currentRd && currentRd.status !== 'ready' ? (
        <div className="assignee-readiness-hint" data-testid="assignee-readiness-hint">
          <span>
            当前指派就绪：<strong>{readinessHint(currentRd)}</strong>
            {currentRd.detail ? ` · ${currentRd.detail}` : ''}
          </span>
          <span className="assignee-readiness-links">
            {currentRd.status === 'runtime_missing' ? (
              <Link href="/runtimes">运行时</Link>
            ) : (
              <Link href="/settings">环境诊断</Link>
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
}
