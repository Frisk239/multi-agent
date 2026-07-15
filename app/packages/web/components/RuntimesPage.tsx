'use client';
import { useRuntimes } from '@/lib/api';

export function RuntimesPage() {
  const { data, refetch, isFetching } = useRuntimes();
  if (!data) return <div className="runtime-page">加载中…</div>;

  const { machine, runtimes } = data;
  const installed = runtimes.filter((r) => r.installed).length;

  return (
    <div className="runtime-layout">
      <aside className="machine-list">
        <div className="machine-list-header">运行时 {runtimes.length}</div>
        <div style={{ padding: '8px 16px', fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
          本机
        </div>
        <div className="machine-item active">
          <div className="machine-item-name">{machine.name}</div>
          <div className="machine-item-meta">{runtimes.length} 个运行时</div>
          <span className="machine-tag">本机</span>
        </div>
      </aside>

      <section className="runtime-detail">
        <header className="runtime-detail-header">
          <div className="runtime-detail-title">
            <span className="status-dot-green" /> {machine.name}{' '}
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>在线</span>
          </div>
          <div className="runtime-meta">
            {installed} 已安装 · cwd={machine.cwd ?? '（未配置 MA_WORKSPACE_CWD）'}
          </div>
          <div className="runtime-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              重新探测
            </button>
          </div>
        </header>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>运行时</th>
                <th>健康度</th>
                <th>智能体</th>
                <th>费用 - 7天</th>
                <th>CLI</th>
              </tr>
            </thead>
            <tbody>
              {runtimes.map((rt) => (
                <tr key={rt.id}>
                  <td>{rt.label}</td>
                  <td>
                    {rt.installed ? (
                      <span className="status-online">
                        <span className="status-dot-green" /> 可用
                      </span>
                    ) : (
                      <span className="status-offline">未检测到</span>
                    )}
                  </td>
                  <td>{rt.agentIds.length ? `${rt.agentIds.length} 个` : '—'}</td>
                  <td>—</td>
                  <td>
                    <code>{rt.version ?? '—'}</code>
                    {rt.path ? (
                      <div>
                        <small className="runtime-path">{rt.path}</small>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
