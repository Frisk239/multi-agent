'use client';
import { useRuntimes } from '@/lib/api';
import type { RuntimeId } from '@ma/shared';

const RUNTIME_ICON: Record<RuntimeId, string> = {
  'claude-code': '☀',
  cursor: '◧',
  opencode: '▣',
};

export function RuntimesPage() {
  const { data, refetch, isFetching } = useRuntimes();
  if (!data) return <div className="runtime-page">加载中…</div>;

  const { machine, runtimes } = data;
  const installed = runtimes.filter((r) => r.installed).length;

  return (
    <div className="runtime-layout">
      <aside className="machine-list">
        <div className="machine-list-header">运行时 {runtimes.length}</div>
        <div className="machine-filters">
          <button type="button" className="machine-filter active">
            全部 {installed}
          </button>
          <button type="button" className="machine-filter">
            在线 {installed}
          </button>
        </div>
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
        <div className="runtime-detail-title">
          <span className="status-dot-green" /> {machine.name}{' '}
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>在线</span>
        </div>
        <div className="runtime-meta">
          {runtimes.length} 个运行时 · {installed} 个在线 · cwd={machine.cwd ?? '（未配置 MA_WORKSPACE_CWD）'}
        </div>
        <div className="runtime-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            重新探测
          </button>
        </div>

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
                  <td>
                    <span className="runtime-type-icon">{RUNTIME_ICON[rt.id]}</span> {rt.label}{' '}
                    <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>[内置]</span>
                  </td>
                  <td>
                    {rt.installed ? (
                      <span className="status-online">
                        <span className="status-dot-green" /> 在线
                      </span>
                    ) : (
                      <span className="status-offline">未检测到</span>
                    )}
                  </td>
                  <td>{rt.agentIds.length ? `${rt.agentIds.length} 个` : '—'}</td>
                  <td>—</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                    {rt.version ?? '—'}
                    {rt.path ? <div className="runtime-path">{rt.path}</div> : null}
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
