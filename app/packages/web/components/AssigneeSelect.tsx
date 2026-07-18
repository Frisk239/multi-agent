'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import {
  useAgents,
  useAgentsReadinessMap,
  useSquads,
  useUpdateIssue,
} from '@/lib/api';
import type { AgentReadiness, Assignee, SquadDetail } from '@ma/shared';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function readinessHint(rd: AgentReadiness | null | undefined): string {
  if (!rd) return '';
  if (rd.status === 'ready') return 'ready';
  if (rd.status === 'busy') return 'busy';
  if (rd.status === 'cwd_missing') return 'cwd 未配置';
  if (rd.status === 'runtime_missing') return 'runtime 缺失';
  return rd.status;
}

function isBlocked(rd: AgentReadiness | null | undefined): boolean {
  if (!rd) return false;
  return rd.status !== 'ready' && rd.status !== 'busy';
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

function squadRosterIds(
  detail: SquadDetail | undefined,
  leaderId: string | null | undefined,
): string[] {
  const s = new Set<string>();
  if (leaderId) s.add(leaderId);
  for (const m of detail?.members ?? []) s.add(m.agentId);
  return [...s];
}

function squadBlockedSummary(
  detail: SquadDetail | undefined,
  leaderId: string | null | undefined,
  readinessMap: Record<string, AgentReadiness | null | undefined>,
  agentNameById: Map<string, string>,
): { blocked: number; total: number; labels: string[] } {
  const ids = squadRosterIds(detail, leaderId);
  const labels: string[] = [];
  let blocked = 0;
  for (const id of ids) {
    const rd = readinessMap[id];
    if (!isBlocked(rd)) continue;
    blocked += 1;
    const name = agentNameById.get(id) ?? id;
    const role = id === leaderId ? '队长' : '成员';
    labels.push(`${role}${name}（${readinessHint(rd)}）`);
  }
  return { blocked, total: ids.length, labels };
}

// S04 + readiness：指派前展示/确认阻塞项；小队含成员摘要（不硬拦截）
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

  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  // 轻量预取各小队成员，用于 option/确认/当前指派摘要
  const squadDetailQueries = useQueries({
    queries: squads.map((s) => ({
      queryKey: ['squad', s.id],
      queryFn: async (): Promise<SquadDetail> => {
        const res = await fetch(`${API}/squads/${encodeURIComponent(s.id)}`);
        if (!res.ok) throw new Error('squad 不存在');
        return res.json();
      },
      enabled: !!s.id,
      staleTime: 30_000,
    })),
  });

  const squadDetailById = useMemo(() => {
    const m = new Map<string, SquadDetail>();
    squads.forEach((s, i) => {
      const d = squadDetailQueries[i]?.data;
      if (d) m.set(s.id, d);
    });
    return m;
  }, [squads, squadDetailQueries]);

  const currentValue =
    currentAssignee?.type === 'agent'
      ? `agent:${currentAssignee.id}`
      : currentAssignee?.type === 'squad'
        ? `squad:${currentAssignee.id}`
        : '';

  const currentSquad =
    currentAssignee?.type === 'squad'
      ? squads.find((s) => s.id === currentAssignee.id)
      : undefined;
  const currentSquadDetail =
    currentAssignee?.type === 'squad'
      ? squadDetailById.get(currentAssignee.id)
      : undefined;

  const currentAgentId =
    currentAssignee?.type === 'agent'
      ? currentAssignee.id
      : currentAssignee?.type === 'squad'
        ? currentSquad?.leaderId
        : undefined;
  const currentRd =
    currentAgentId != null ? readinessMap[currentAgentId] ?? null : null;

  const currentSquadSummary =
    currentAssignee?.type === 'squad'
      ? squadBlockedSummary(
          currentSquadDetail,
          currentSquad?.leaderId,
          readinessMap,
          agentNameById,
        )
      : null;

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
      const detail = squadDetailById.get(sq.id);
      const leaderId = sq.leaderId;
      const leaderRd = leaderId ? readinessMap[leaderId] : null;
      const leaderName = leaderId
        ? agents.find((a) => a.id === leaderId)?.name ?? '队长'
        : '队长';
      const summary = squadBlockedSummary(detail, leaderId, readinessMap, agentNameById);
      const leaderBlock = readinessBlockMessage(
        `小队「${sq.name}」队长（${leaderName}）`,
        leaderRd,
      );

      let msg: string;
      if (leaderBlock) {
        msg = leaderBlock;
        if (summary.blocked > 1 || (summary.blocked === 1 && !isBlocked(leaderRd))) {
          msg += `\n另有成员阻塞 ${summary.blocked}/${summary.total || '—'}` +
            (summary.labels.length ? `：${summary.labels.slice(0, 4).join('、')}` : '') +
            '。';
        }
      } else if (summary.blocked > 0) {
        msg =
          `小队「${sq.name}」队长可执行，但有 ${summary.blocked}/${summary.total} 名成员阻塞` +
          (summary.labels.length ? `：${summary.labels.slice(0, 4).join('、')}` : '') +
          '。队长仍会启动并 briefing；仍要指派吗？';
      } else {
        msg = `将启动小队「${sq.name}」：队长被执行并 briefing 委派成员。可随时停止。继续？`;
      }
      if (!confirm(msg)) return;
      update.mutate({
        id: issueId,
        input: { assignee: { type: 'squad', id: sq.id } },
      });
    }
  }

  const showAgentHint =
    currentAssignee?.type === 'agent' && currentRd && currentRd.status !== 'ready';
  const showSquadHint =
    currentAssignee?.type === 'squad' &&
    ((currentRd && currentRd.status !== 'ready') ||
      (currentSquadSummary != null && currentSquadSummary.blocked > 0));

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
            const detail = squadDetailById.get(s.id);
            const summary = squadBlockedSummary(
              detail,
              s.leaderId,
              readinessMap,
              agentNameById,
            );
            const leaderHint = s.leaderId
              ? readinessHint(readinessMap[s.leaderId])
              : '';
            const memberHint =
              summary.total > 0
                ? summary.blocked > 0
                  ? ` · 阻塞 ${summary.blocked}/${summary.total}`
                  : ` · 成员 ok ${summary.total}`
                : '';
            return (
              <option key={s.id} value={`squad:${s.id}`}>
                {s.name}
                {leaderHint ? ` · 队长 ${leaderHint}` : ''}
                {memberHint}
              </option>
            );
          })}
        </optgroup>
      </select>
      {showAgentHint ? (
        <div className="assignee-readiness-hint" data-testid="assignee-readiness-hint">
          <span>
            当前指派就绪：<strong>{readinessHint(currentRd)}</strong>
            {currentRd?.detail ? ` · ${currentRd.detail}` : ''}
          </span>
          <span className="assignee-readiness-links" data-testid="assignee-recovery-links">
            {currentRd?.status === 'runtime_missing' ? (
              <Link href="/runtimes" data-testid="assignee-recovery-runtimes">
                运行时
              </Link>
            ) : (
              <Link href="/settings" data-testid="assignee-recovery-settings">
                环境诊断
              </Link>
            )}
            {currentAgentId ? (
              <Link href={`/agents/${currentAgentId}`} data-testid="assignee-recovery-agent">
                智能体详情
              </Link>
            ) : null}
            {currentRd?.status && currentRd.status !== 'ready' && currentRd.status !== 'busy' ? (
              <Link
                href={`/agents?ready=${encodeURIComponent(currentRd.status)}`}
                data-testid="assignee-recovery-same-status"
              >
                同态列表
              </Link>
            ) : null}
            <Link
              href="/runs?status=failed"
              data-testid="assignee-recovery-failed-runs"
            >
              失败运行
            </Link>
          </span>
        </div>
      ) : null}
      {showSquadHint ? (
        <div
          className="assignee-readiness-hint"
          data-testid="assignee-squad-readiness-hint"
        >
          <span>
            小队就绪：队长 <strong>{readinessHint(currentRd) || '…'}</strong>
            {currentSquadSummary
              ? ` · 成员阻塞 ${currentSquadSummary.blocked}/${currentSquadSummary.total || '—'}`
              : ''}
            {currentSquadSummary?.labels?.length
              ? `（${currentSquadSummary.labels.slice(0, 3).join('、')}）`
              : ''}
          </span>
          <span className="assignee-readiness-links" data-testid="assignee-squad-recovery-links">
            {currentAssignee?.type === 'squad' ? (
              <Link href={`/squads/${currentAssignee.id}`} data-testid="assignee-recovery-squad">
                小队详情
              </Link>
            ) : null}
            {currentRd?.status === 'runtime_missing' ? (
              <Link href="/runtimes" data-testid="assignee-recovery-runtimes">
                运行时
              </Link>
            ) : (
              <Link href="/settings" data-testid="assignee-recovery-settings">
                环境诊断
              </Link>
            )}
            {currentRd?.status && currentRd.status !== 'ready' && currentRd.status !== 'busy' ? (
              <Link
                href={`/squads?ready=${encodeURIComponent(currentRd.status)}`}
                data-testid="assignee-recovery-squads-same"
              >
                同态小队
              </Link>
            ) : null}
            {currentAssignee?.type === 'squad' ? (
              <Link
                href={`/runs?squad=${encodeURIComponent(currentAssignee.id)}&status=failed`}
                data-testid="assignee-recovery-squad-failed-runs"
              >
                失败运行
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
