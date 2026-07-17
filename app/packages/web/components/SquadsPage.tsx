'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CreateSquadInput } from '@ma/shared';
import {
  useAgents,
  useCreateSquad,
  useDeleteSquad,
  useSquads,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

// bu02：小队列表 + 新建（leader / members / protocol / directive）
export function SquadsPage() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useSquads();
  const { data: agents = [] } = useAgents();
  const create = useCreateSquad();
  const del = useDeleteSquad();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [operatingProtocol, setOperatingProtocol] = useState('');
  const [missionDirective, setMissionDirective] = useState('');

  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  // 默认 leader：第一个 agent
  const defaultLeader = agents[0]?.id ?? '';

  function resetForm() {
    setName('');
    setLeaderId('');
    setMemberIds([]);
    setOperatingProtocol('');
    setMissionDirective('');
    setOpen(false);
  }

  function toggleMember(id: string) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lid = leaderId || defaultLeader;
    if (!name.trim() || !lid) return;
    const input: CreateSquadInput = {
      name: name.trim(),
      leaderId: lid,
      operatingProtocol,
      missionDirective,
      memberIds,
    };
    create.mutate(input, {
      onSuccess: (squad) => {
        resetForm();
        router.push(`/squads/${squad.id}`);
      },
    });
  }

  function handleDelete(id: string, label: string) {
    if (!window.confirm(`确定删除小队「${label}」？`)) return;
    del.mutate(id);
  }

  if (isLoading) return <div className="page-container">加载中…</div>;
  if (isError) {
    return (
      <div className="page-container">
        <EmptyState
          title="加载小队失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      </div>
    );
  }

  const squads = data ?? [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            小队 <span className="count">{squads.length}</span>
          </div>
          <div className="page-desc">leader 执行 + briefing 注入 + mention 闭环</div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOpen((v) => !v)}
            disabled={agents.length === 0}
          >
            {open ? '收起' : '新建小队'}
          </button>
        </div>
      </div>

      {open && (
        <form className="ops-form" onSubmit={submit}>
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>名称</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：补2小队"
                required
                autoFocus
              />
            </label>
            <label className="ops-field">
              <span>Leader</span>
              <select
                value={leaderId || defaultLeader}
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
          </div>

          <div className="ops-field">
            <span>成员（可 @mention 的 peers；可不含 leader）</span>
            <div className="ops-check-list">
              {agents.map((a) => (
                <label key={a.id} className="ops-check-item">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(a.id)}
                    onChange={() => toggleMember(a.id)}
                  />
                  <span>
                    {a.name} <code className="text-dim text-sm">{a.runtime}</code>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="ops-field">
            <span>Operating Protocol</span>
            <textarea
              className="ops-textarea"
              rows={3}
              value={operatingProtocol}
              onChange={(e) => setOperatingProtocol(e.target.value)}
              placeholder="协作规则…"
            />
          </label>
          <label className="ops-field">
            <span>Mission Directive</span>
            <textarea
              className="ops-textarea"
              rows={3}
              value={missionDirective}
              onChange={(e) => setMissionDirective(e.target.value)}
              placeholder="任务指令…"
            />
          </label>

          <div className="ops-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={create.isPending || !name.trim() || !(leaderId || defaultLeader)}
            >
              {create.isPending ? '创建中…' : '创建'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              取消
            </button>
          </div>
        </form>
      )}

      {squads.length === 0 ? (
        <EmptyState
          title="创建一个小队开始协作"
          description="选择 leader 与成员，配置 protocol / directive"
        />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>小队</th>
                <th>Leader</th>
                <th>成员数</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {squads.map((sq) => (
                <tr key={sq.id}>
                  <td>
                    <Link href={`/squads/${sq.id}`} className="agent-cell">
                      <span className="agent-icon-sm">
                        <Icon name="squad" size={14} />
                      </span>
                      <span>
                        <div className="agent-cell-name">{sq.name}</div>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {sq.leaderId ? (
                      <Link href={`/agents/${sq.leaderId}`}>
                        {agentNameById.get(sq.leaderId) ?? <code>{sq.leaderId}</code>}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-dim">{sq.memberCount ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={del.isPending}
                      onClick={() => handleDelete(sq.id, sq.name)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
