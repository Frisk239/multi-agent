'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import {
  API,
  apiFetch,
  useAgents,
  useAgentsReadinessMap,
  useSquads,
  useUpdateIssue,
} from '@/lib/api';
import type { AgentReadiness, Assignee, SquadDetail } from '@ma/shared';
import { confirmDialog } from '@/lib/confirm-store';
import { toastSuccess } from '@/lib/toast';
import { Select } from './Select';

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

/** F8：cwd/runtime/error 与服务端硬闸对齐——UI 直接拒绝指派（busy 仍可排队） */
function isHardBlocked(rd: AgentReadiness | null | undefined): boolean {
  if (!rd) return false;
  return (
    rd.status === 'cwd_missing' ||
    rd.status === 'runtime_missing' ||
    rd.status === 'error'
  );
}

function readinessBlockMessage(
  name: string,
  rd: AgentReadiness | null | undefined,
): string | null {
  if (!rd) return null;
  if (rd.status === 'ready' || rd.status === 'busy') return null;
  if (rd.status === 'cwd_missing') {
    return `${name} 不可指派：工作区未就绪（服务端硬闸）。请到 Settings 保存路径或关闭 MA_ISSUE_USE_WORKSPACE_CWD。`;
  }
  if (rd.status === 'runtime_missing') {
    return `${name} 不可指派：runtime ${rd.runtime} 未检测到（服务端硬闸）。请到「运行时」安装 CLI。`;
  }
  if (rd.status === 'error') {
    return `${name} 不可指派：就绪探测失败${rd.detail ? `（${rd.detail}）` : ''}。`;
  }
  return `${name} 就绪状态为 ${rd.status}${rd.detail ? `（${rd.detail}）` : ''}。继续？`;
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
        const res = await apiFetch(`${API}/squads/${encodeURIComponent(s.id)}`);
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

  async function onChange(value: string) {
    if (value === '') {
      // 清除指派：停止运行 — 不可逆，组件化确认
      const ok = await confirmDialog({
        title: '清除指派？',
        description: '清除指派并停止当前运行。',
        confirmLabel: '清除指派',
        variant: 'danger',
      });
      if (!ok) return;
      update.mutate({ id: issueId, input: { assignee: null } });
      return;
    }
    if (value.startsWith('agent:')) {
      const ag = agents.find((a) => a.id === value.slice('agent:'.length));
      if (!ag) return;
      const rd = readinessMap[ag.id];
      const block = readinessBlockMessage(ag.name, rd);
      // 硬闸：不可指派（信息 modal，不真正执行）
      if (block && isHardBlocked(rd)) {
        await confirmDialog({
          title: '无法指派',
          description: block,
          confirmLabel: '知道了',
          hideCancel: true,
        });
        return;
      }
      // soft-block：仍可排队，但需确认
      if (block) {
        const ok = await confirmDialog({
          title: '指派有阻塞',
          description: block,
          confirmLabel: '仍要指派',
        });
        if (!ok) return;
      } else {
        // ready / busy：Slice 48 减噪 — 不再 browser confirm，直接执行 + toast
        toastSuccess(`已指派 ${ag.name}（${ag.runtime}）`);
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

      // F8：队长硬闸 → 不允许指派（与 enqueue 一致）
      if (leaderBlock && isHardBlocked(leaderRd)) {
        await confirmDialog({
          title: '无法指派小队',
          description: leaderBlock,
          confirmLabel: '知道了',
          hideCancel: true,
        });
        return;
      }

      // soft leader block 或成员阻塞 → 组件化确认
      if (leaderBlock) {
        let msg = leaderBlock;
        if (summary.blocked > 1 || (summary.blocked === 1 && !isBlocked(leaderRd))) {
          msg +=
            `\n另有成员阻塞 ${summary.blocked}/${summary.total || '—'}` +
            (summary.labels.length ? `：${summary.labels.slice(0, 4).join('、')}` : '') +
            '。';
        }
        const ok = await confirmDialog({
          title: '指派小队有阻塞',
          description: msg,
          confirmLabel: '仍要指派',
        });
        if (!ok) return;
      } else if (summary.blocked > 0) {
        const msg =
          `小队「${sq.name}」队长可执行，但有 ${summary.blocked}/${summary.total} 名成员阻塞` +
          (summary.labels.length ? `：${summary.labels.slice(0, 4).join('、')}` : '') +
          '。队长仍会启动并 briefing；仍要指派吗？';
        const ok = await confirmDialog({
          title: '小队成员有阻塞',
          description: msg,
          confirmLabel: '仍要指派',
        });
        if (!ok) return;
      } else {
        // ready：减噪，直接派发 + toast
        toastSuccess(`已指派小队「${sq.name}」`);
      }
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
      <Select
        value={currentValue}
        onChange={(e) => {
          void onChange(e.target.value);
        }}
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
      </Select>
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
