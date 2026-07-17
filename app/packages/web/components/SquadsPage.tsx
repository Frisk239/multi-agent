'use client';

import Link from 'next/link';
import { useSquads } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

// S12：小队列表（name → 详情）
export function SquadsPage() {
  const { data, isLoading, isError, error } = useSquads();

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
      </div>

      {squads.length === 0 ? (
        <EmptyState title="暂无小队" description="seed 或后续配置会创建小队" />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>小队</th>
                <th>ID</th>
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
                    <code className="text-dim text-sm">{sq.id}</code>
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
