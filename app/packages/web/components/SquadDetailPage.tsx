'use client';

import Link from 'next/link';
import { useSquad } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

// S12：小队详情 — protocol / directive / members（只读）
export function SquadDetailPage({ squadId }: { squadId: string }) {
  const { data: squad, isLoading, isError, error } = useSquad(squadId);

  if (isLoading) return <div className="page-container">加载中…</div>;
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
                <Link href={`/agents/${squad.leaderId}`}>
                  <code>{squad.leaderId}</code>
                </Link>
              </span>
            </div>
            <div className="prop-row">
              <span className="prop-label">成员</span>
              <span>{squad.members.length}</span>
            </div>
          </div>
        </aside>

        <div className="agent-main">
          <section className="squad-section">
            <h3 className="squad-section-title">Operating Protocol</h3>
            <pre className="squad-prose">
              {squad.operatingProtocol?.trim() || '（空）'}
            </pre>
          </section>

          <section className="squad-section">
            <h3 className="squad-section-title">Mission Directive</h3>
            <pre className="squad-prose">
              {squad.missionDirective?.trim() || '（空）'}
            </pre>
          </section>

          <section className="squad-section">
            <h3 className="squad-section-title">
              Members <span className="count">{squad.members.length}</span>
            </h3>
            {squad.members.length === 0 ? (
              <p className="text-dim text-sm">暂无成员（leader 不在 roster 表）</p>
            ) : (
              <ul className="squad-member-list">
                {squad.members.map((m) => (
                  <li key={m.agentId}>
                    <Link href={`/agents/${m.agentId}`} className="agent-cell">
                      <span className="agent-icon-sm">
                        <Icon name="agent" size={14} />
                      </span>
                      <span>
                        <div className="agent-cell-name">{m.name}</div>
                        <div className="text-dim text-sm">
                          <code>{m.agentId}</code>
                        </div>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
