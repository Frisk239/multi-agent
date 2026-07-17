'use client';
import Link from 'next/link';
import { useRuntimes } from '@/lib/api';
import { Icon } from './Icon';

export function RuntimesPage() {
  const { data, refetch, isFetching } = useRuntimes();
  if (!data) return <div className="runtime-page">加载中…</div>;

  const { machine, runtimes } = data;
  const installed = runtimes.filter((r) => r.installed).length;

  return (
    <div className="runtime-layout" data-testid="runtimes-page">
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
        <div className="machine-section-label">本机</div>
        <div className="machine-item active">
          <div className="machine-item-name">{machine.name}</div>
          <div className="machine-item-meta">{runtimes.length} 个运行时</div>
          <span className="machine-tag">本机</span>
        </div>
      </aside>

      <section className="runtime-detail">
        <div className="runtime-detail-title">
          <span className="status-dot-green" /> {machine.name}{' '}
          <span className="runtime-detail-status">在线</span>
        </div>
        <div className="runtime-meta">
          {runtimes.length} 个运行时 · {installed} 个在线 · cwd={machine.cwd ?? '（未配置 MA_WORKSPACE_CWD）'}
        </div>
        <div className="runtime-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            data-testid="runtimes-refresh"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? '探测中…' : '重新探测'}
          </button>
          <Link href="/settings" className="btn-secondary btn-sm" data-testid="runtimes-to-settings">
            环境诊断
          </Link>
          <Link href="/agents" className="btn-ghost btn-sm" data-testid="runtimes-to-agents">
            智能体
          </Link>
        </div>
        {!machine.cwd ? (
          <div className="runtime-cwd-banner" data-testid="runtimes-cwd-banner" role="status">
            <strong>工作区 cwd 未配置</strong>
            <span className="text-sm"> 运行时即使在线，派活仍可能立刻失败。</span>
            <Link href="/settings" className="btn-secondary btn-sm">去设置</Link>
          </div>
        ) : null}
        {runtimes.some((r) => !r.installed) ? (
          <div className="runtime-missing-banner" data-testid="runtimes-missing-banner" role="status">
            <strong>有 CLI 未检测到</strong>
            <span className="text-sm">
              {' '}
              {runtimes.filter((r) => !r.installed).map((r) => r.label).join('、')}
              。安装并加入 PATH 后点「重新探测」。
            </span>
          </div>
        ) : null}

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
                <tr key={rt.id} data-testid="runtime-row" data-runtime={rt.id} data-installed={rt.installed ? "1" : "0"}>
                  <td>
                    <span className="runtime-type-icon">
                      <Icon name="bot" size={14} />
                    </span>
                    {rt.label} <span className="runtime-internal">[内置]</span>
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
                  <td className="runtime-cli">
                    <code>{rt.version ?? '—'}</code>
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
