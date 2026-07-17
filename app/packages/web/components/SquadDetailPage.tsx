'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useAgents,
  useDeleteSquad,
  useSquad,
  useUpdateSquad,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

// bu02：小队详情可编辑 — protocol / directive / leader / members
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

  return (
    <div className="page-container">
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

          <div className="profile-section">
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
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
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
                {agents.map((a) => (
                  <label key={a.id} className="ops-check-item">
                    <input
                      type="checkbox"
                      checked={memberIds.includes(a.id)}
                      onChange={() => toggleMember(a.id)}
                    />
                    <span>
                      <Link href={`/agents/${a.id}`}>{a.name}</Link>{' '}
                      <code className="text-dim text-sm">{a.id}</code>
                    </span>
                  </label>
                ))}
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
