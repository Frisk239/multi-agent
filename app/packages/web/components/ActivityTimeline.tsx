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
        return { icon: '👤', title: '指派变更', color: 'var(--color-purple)' };
      case 'priority_changed':
        return { icon: '⚡', title: '优先级变更', color: 'var(--color-orange)' };
      case 'run_started':
        return { icon: '🚀', title: 'Run 开始执行', color: 'var(--color-blue)' };
      case 'run_completed':
        return { icon: '✅', title: 'Run 执行完成', color: 'var(--color-green)' };
      case 'run_failed':
        return { icon: '❌', title: 'Run 执行失败', color: 'var(--color-red)' };
      case 'run_deferred':
        return { icon: '⏳', title: 'Deferred · 排队未 claim', color: 'var(--color-orange)' };
      case 'squad_escalated':
        return { icon: '🚨', title: '小队升级告警', color: 'var(--color-red)' };
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
              className="activity-timeline-item"
              data-testid="activity-item"
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
                    {(act.eventType === 'run_started' ||
                      act.eventType === 'run_completed' ||
                      act.eventType === 'run_failed' ||
                      act.eventType === 'run_deferred' ||
                      act.eventType === 'squad_escalated') && (
                      <div>
                        <Link href={`/runs?run=${act.payload.runId}`} className="text-sm" style={{ textDecoration: 'underline' }}>
                          查看 Run {act.payload.runId?.slice(0, 8)}
                        </Link>
                        {act.payload.error ? <span className="text-red" style={{ marginLeft: 8 }}>({act.payload.error})</span> : null}
                        {act.eventType === 'run_deferred' && act.payload.reason ? (
                          <span className="text-dim" style={{ marginLeft: 8 }}>
                            ({act.payload.reason})
                          </span>
                        ) : null}
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
