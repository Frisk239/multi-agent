'use client';
import Link from 'next/link';
import { useAgents } from '@/lib/api';
import { Icon } from './Icon';

// 照原型 renderAgentsList（app.js:419）简化：
// 表格列 agent 名（+分类）/ 状态 / 运行时。点行进详情页。
// S05 最薄可达路径——让 agent 详情（Skills/MCP Tab）可达。
export function AgentsPage() {
  const { data } = useAgents();
  if (!data) return <div className="page-container">加载中…</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            智能体 <span className="count">{data.length}</span>
          </div>
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>智能体</th>
              <th>运行时</th>
            </tr>
          </thead>
          <tbody>
            {data.map((ag) => (
              <tr key={ag.id}>
                <td>
                  <Link href={`/agents/${ag.id}`} className="agent-cell">
                    <span className="agent-icon-sm">
                      <Icon name="agent" size={14} />
                    </span>
                    <span>
                      <div className="agent-cell-name">{ag.name}</div>
                    </span>
                  </Link>
                </td>
                <td>
                  <code>{ag.runtime}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
