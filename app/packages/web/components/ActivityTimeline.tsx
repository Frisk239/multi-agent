'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ActivityLog } from '@ma/shared';

export function ActivityTimeline({ issueId }: { issueId: string }) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/issues/${issueId}/activities`)
      .then((res) => res.ok ? res.json() : { activities: [] })
      .then((data) => {
        if (active) {
          setActivities(data.activities || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [issueId]);

  if (loading) {
    return <div className="text-dim text-sm" data-testid="activity-timeline" style={{ padding: 16 }}>加载活动记录…</div>;
  }

  if (activities.length === 0) {
    return <div className="text-dim text-sm" data-testid="activity-timeline" style={{ padding: 16 }}>暂无活动记录</div>;
  }

  const getEventBadge = (event: ActivityLog) => {
    switch (event.eventType) {
      case 'status_changed':
        return { icon: '🔄', title: '状态变更', color: 'var(--accent)' };
      case 'assignee_changed':
        return { icon: '👤', title: '指派变更', color: '#a78bfa' };
      case 'priority_changed':
        return { icon: '⚡', title: '优先级变更', color: '#f59e0b' };
      case 'run_started':
        return { icon: '🚀', title: 'Run 开始执行', color: '#3b82f6' };
      case 'run_completed':
        return { icon: '✅', title: 'Run 执行完成', color: '#10b981' };
      case 'run_failed':
        return { icon: '❌', title: 'Run 执行失败', color: '#ef4444' };
      default:
        return { icon: '📌', title: event.eventType, color: 'var(--text-dim)' };
    }
  };

  return (
    <div className="activity-timeline" data-testid="activity-timeline" style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activities.map((act) => {
          const badge = getEventBadge(act);
          const timeStr = act.createdAt ? new Date(act.createdAt).toLocaleString() : '';
          return (
            <div
              key={act.id}
              data-testid="activity-item"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: '20px' }}>{badge.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: badge.color }}>
                    {act.actorName} · {badge.title}
                  </span>
                  <span className="text-dim text-xs" style={{ whiteSpace: 'nowrap' }}>{timeStr}</span>
                </div>
                {act.payload ? (
                  <div className="text-sm" style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                    {act.eventType === 'status_changed' && (
                      <span>
                        状态由 <code className="run-pill">{act.payload.from}</code> 变为 <code className="run-pill">{act.payload.to}</code>
                      </span>
                    )}
                    {act.eventType === 'priority_changed' && (
                      <span>
                        优先级由 <code>{act.payload.from || '无'}</code> 调整为 <code>{act.payload.to || '无'}</code>
                      </span>
                    )}
                    {act.eventType === 'assignee_changed' && (
                      <span>
                        指派调整为: <code>{act.payload.to || '未指派'}</code>
                      </span>
                    )}
                    {(act.eventType === 'run_started' || act.eventType === 'run_completed' || act.eventType === 'run_failed') && (
                      <div>
                        <Link href={`/runs?run=${act.payload.runId}`} className="text-sm" style={{ textDecoration: 'underline' }}>
                          查看 Run {act.payload.runId?.slice(0, 8)}
                        </Link>
                        {act.payload.error ? <span className="text-red" style={{ marginLeft: 8 }}>({act.payload.error})</span> : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
