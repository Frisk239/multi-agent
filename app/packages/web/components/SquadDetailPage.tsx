'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentReadiness } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useDeleteSquad,
  useSquad,
  useUpdateSquad,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { SquadRunsTimeline } from './SquadRunsTimeline';

function readinessClass(status: AgentReadiness['status'] | undefined): string {
  if (status === 'ready') return 'readiness-chip readiness-ready';
  if (status === 'busy') return 'readiness-chip readiness-busy';
  return 'readiness-chip readiness-missing';
}

function readinessLabel(rd: AgentReadiness | null | undefined): string {
  if (!rd) return '…';
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

// bu02 + 就绪汇总：小队详情可编辑 — protocol / directive / leader / members
export function SquadDetailPage({ squadId }: { squadId: string }) {
  const router = useRouter();
  const { data: squad, isLoading, isError, error } = useSquad(squadId);
  const { data: agents = [] } = useAgents();
  const update = useUpdateSquad(squadId);
  const del = useDeleteSquad();

  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [operatingProtocol, setOperatingProtocol] = useState('');
  const [missionDirective, setMissionDirective] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!squad) return;
    setName(squad.name);
    setLeaderId(squad.leaderId);
    setMemberIds(squad.members.map((m) => m.agentId));
    setOperatingProtocol(squad.operatingProtocol ?? '');
    setMissionDirective(squad.missionDirective ?? '');
    setReady(true);
  }, [squad]);

  // leader + 已存 members + 表单勾选成员，一并探就绪
  const readinessAgentIds = useMemo(() => {
    const s = new Set<string>();
    if (squad?.leaderId) s.add(squad.leaderId);
    for (const m of squad?.members ?? []) s.add(m.agentId);
    for (const id of memberIds) s.add(id);
    if (leaderId) s.add(leaderId);
    return [...s];
  }, [squad, memberIds, leaderId]);

  const { data: readinessMap = {} } = useAgentsReadinessMap(readinessAgentIds);

  const roster = useMemo(() => {
    if (!squad) return [] as Array<{ agentId: string; name: string; role: 'leader' | 'member' }>;
    const rows: Array<{ agentId: string; name: string; role: 'leader' | 'member' }> = [];
    const leaderName =
      agents.find((a) => a.id === squad.leaderId)?.name ?? squad.leaderId;
    if (squad.leaderId) {
      rows.push({ agentId: squad.leaderId, name: leaderName, role: 'leader' });
    }
    for (const m of squad.members) {
      if (m.agentId === squad.leaderId) continue;
      rows.push({
        agentId: m.agentId,
        name: m.name || agents.find((a) => a.id === m.agentId)?.name || m.agentId,
        role: 'member',
      });
    }
    return rows;
  }, [squad, agents]);

  const summary = useMemo(() => {
    let ok = 0;
    let warn = 0;
    let bad = 0;
    let unknown = 0;
    for (const r of roster) {
      const rd = readinessMap[r.agentId];
      if (!rd) {
        unknown += 1;
        continue;
      }
      if (rd.status === 'ready') ok += 1;
      else if (rd.status === 'busy') warn += 1;
      else bad += 1;
    }
    return { ok, warn, bad, unknown, total: roster.length };
  }, [roster, readinessMap]);

  if (isLoading || (squad && !ready)) return <div className="page-container">加载中…</div>;
  if (isError || !squad) {
    return (
      <div className="page-container">
        <EmptyState
          title="小队不存在"
          description={error instanceof Error ? error.message : '找不到该小队'}
          action={
            <Link href="/squads" className="btn btn-ghost btn-sm">
              返回列表
            </Link>
          }
        />
      </div>
    );
  }

  function toggleMember(id: string) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !leaderId) return;
    update.mutate({
      name: name.trim(),
      leaderId,
      operatingProtocol,
      missionDirective,
      memberIds,
    });
  }

  function handleDelete() {
    if (!squad) return;
    if (!window.confirm(`确定删除小队「${squad.name}」？`)) return;
    del.mutate(squadId, {
      onSuccess: () => router.push('/squads'),
    });
  }

  const leaderName =
    agents.find((a) => a.id === squad.leaderId)?.name ?? squad.leaderId;
  const leaderRd = squad.leaderId ? readinessMap[squad.leaderId] : null;
  const leaderBlocked = isBlocked(leaderRd);

  return (
    <div className="page-container" data-testid="squad-detail">
      <div className="agent-detail-breadcrumb">
        <Link href="/squads">小队</Link>
        <span>›</span>
        <span>{squad.name}</span>
      </div>

      <div className="agent-detail-layout">
        <aside className="agent-profile">
          <div className="agent-profile-icon">
            <Icon name="squad" size={24} />
          </div>
          <div className="agent-profile-name">{squad.name}</div>
          <div className="agent-profile-cat">Squad</div>

          <div
            className="squad-readiness-summary"
            data-testid="squad-readiness-summary"
            data-bad={summary.bad}
            data-ok={summary.ok}
            data-warn={summary.warn}
          >
            <div className="squad-readiness-summary-title">成员就绪</div>
            <div className="squad-readiness-counts">
              <span className="squad-rd-count ok">ready {summary.ok}</span>
              <span className="squad-rd-count warn">busy {summary.warn}</span>
              <span className="squad-rd-count bad">阻塞 {summary.bad}</span>
              {summary.unknown > 0 ? (
                <span className="squad-rd-count dim">探测中 {summary.unknown}</span>
              ) : null}
            </div>
            {leaderBlocked ? (
              <div className="squad-readiness-alert" data-testid="squad-leader-blocked">
                <p style={{ margin: '0 0 8px' }}>
                  队长不可执行（{readinessLabel(leaderRd)}
                  {leaderRd?.detail ? ` · ${leaderRd.detail}` : ''}）。
                </p>
                <div
                  className="agent-readiness-recovery"
                  data-testid="squad-leader-recovery"
                  data-status={leaderRd?.status ?? 'unknown'}
                >
                  {leaderRd?.status === 'runtime_missing' ? (
                    <Link
                      href="/runtimes"
                      className="btn btn-secondary btn-sm"
                      data-testid="squad-recovery-runtimes"
                    >
                      运行时探测
                    </Link>
                  ) : (
                    <Link
                      href="/settings"
                      className="btn btn-secondary btn-sm"
                      data-testid="squad-recovery-settings"
                    >
                      配置 cwd / 环境
                    </Link>
                  )}
                  {squad.leaderId ? (
                    <Link
                      href={`/agents/${squad.leaderId}`}
                      className="btn btn-ghost btn-sm"
                      data-testid="squad-recovery-leader"
                    >
                      队长详情
                    </Link>
                  ) : null}
                  {leaderRd?.status ? (
                    <Link
                      href={`/squads?ready=${encodeURIComponent(leaderRd.status)}`}
                      className="btn btn-ghost btn-sm"
                      data-testid="squad-recovery-same-status"
                    >
                      同态小队
                    </Link>
                  ) : null}
                  <Link
                    href={`/?assignee=squad:${encodeURIComponent(squadId)}`}
                    className="btn btn-ghost btn-sm"
                    data-testid="squad-recovery-board"
                  >
                    看板
                  </Link>
                  <Link
                    href={`/runs?squad=${encodeURIComponent(squadId)}&status=failed`}
                    className="btn btn-ghost btn-sm"
                    data-testid="squad-recovery-failed-runs"
                  >
                    失败运行
                  </Link>
                </div>
              </div>
            ) : null}
            {summary.bad > 0 && !leaderBlocked ? (
              <div
                className="agent-readiness-recovery"
                data-testid="squad-members-recovery"
                style={{ marginTop: 8 }}
              >
                <span className="text-sm text-dim">有成员阻塞：</span>
                <Link href="/settings" className="btn btn-ghost btn-sm" data-testid="squad-members-to-settings">
                  环境
                </Link>
                <Link
                  href="/agents?ready=blocked"
                  className="btn btn-ghost btn-sm"
                  data-testid="squad-members-to-agents"
                >
                  不可用智能体
                </Link>
              </div>
            ) : null}
            <ul className="squad-roster-list" data-testid="squad-roster-readiness">
              {roster.map((r) => {
                const rd = readinessMap[r.agentId];
                return (
                  <li key={`${r.role}-${r.agentId}`} data-agent-id={r.agentId} data-role={r.role}>
                    <span className="squad-roster-name">
                      {r.role === 'leader' ? (
                        <span className="leader-badge">队长</span>
                      ) : null}
                      <Link href={`/agents/${r.agentId}`}>{r.name}</Link>
                    </span>
                    <span
                      className={readinessClass(rd?.status)}
                      title={rd?.detail ?? undefined}
                      data-status={rd?.status ?? 'unknown'}
                    >
                      {readinessLabel(rd)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="profile-section">
            <h4>属性</h4>
            <div className="prop-row">
              <span className="prop-label">Leader</span>
              <span>
                <Link href={`/agents/${squad.leaderId}`}>{leaderName}</Link>
              </span>
            </div>
            <div className="prop-row">
              <span className="prop-label">成员</span>
              <span>{squad.members.length}</span>
            </div>
          </div>

          <div className="profile-section profile-actions-stack">
            <Link
              href={`/?assignee=squad:${encodeURIComponent(squadId)}`}
              className="btn btn-secondary btn-sm"
              data-testid="squad-to-board-assignee"
              title="看板筛选指派给本小队的 Issue"
            >
              看板 · 本小队 Issue
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={del.isPending}
              onClick={handleDelete}
            >
              删除小队
            </button>
          </div>
        </aside>

        <div className="agent-main">
          <SquadRunsTimeline squadId={squadId} />
          <form className="ops-form ops-form-inline" onSubmit={save}>
            <label className="ops-field">
              <span>名称</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>

            <label className="ops-field">
              <span>Leader</span>
              <select
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                required
              >
                {agents.map((a) => {
                  const hint = readinessLabel(readinessMap[a.id]);
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {readinessMap[a.id] ? ` · ${hint}` : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="ops-field">
              <span>Operating Protocol</span>
              <textarea
                className="ops-textarea"
                rows={5}
                value={operatingProtocol}
                onChange={(e) => setOperatingProtocol(e.target.value)}
              />
            </label>

            <label className="ops-field">
              <span>Mission Directive</span>
              <textarea
                className="ops-textarea"
                rows={5}
                value={missionDirective}
                onChange={(e) => setMissionDirective(e.target.value)}
              />
            </label>

            <div className="ops-field">
              <span>Members（peers）</span>
              <div className="ops-check-list">
                {agents.map((a) => {
                  const rd = readinessMap[a.id];
                  return (
                    <label key={a.id} className="ops-check-item">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(a.id)}
                        onChange={() => toggleMember(a.id)}
                      />
                      <span className="ops-check-label-row">
                        <span>
                          <Link href={`/agents/${a.id}`}>{a.name}</Link>{' '}
                          <code className="text-dim text-sm">{a.id}</code>
                        </span>
                        {rd ? (
                          <span
                            className={`${readinessClass(rd.status)} readiness-chip-inline`}
                            title={rd.detail ?? undefined}
                          >
                            {readinessLabel(rd)}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-dim text-sm" style={{ marginTop: 8 }}>
                leader 在上方单独选择；可勾选 leader 进 members（幂等，briefing 会过滤）。
              </p>
            </div>

            <div className="ops-form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={update.isPending || !name.trim() || !leaderId}
              >
                {update.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
