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
        <div className="machine-list-header">本机 CLI {runtimes.length}</div>
        <div className="machine-filters">
          <button type="button" className="machine-filter active">
            全部 {runtimes.length}
          </button>
          <button type="button" className="machine-filter">
            已安装 {installed}
          </button>
        </div>
        <div className="machine-section-label">执行宿主</div>
        <div className="machine-item active">
          <div className="machine-item-name">{machine.name}</div>
          <div className="machine-item-meta">{runtimes.length} 个 CLI 适配器</div>
          <span className="machine-tag">本机</span>
        </div>
      </aside>

      <section className="runtime-detail">
        <div className="runtime-detail-title">
          <span className="status-dot-green" /> {machine.name}{' '}
          <span className="runtime-detail-status">本机可用</span>
        </div>
        <p className="runtime-product-note text-dim text-sm" data-testid="runtimes-product-note">
          本页探测的是<strong>本机编码 CLI</strong>（Claude Code / opencode / Cursor），不是 Multica
          云端的「电脑 / daemon 机器」列表。智能体绑定这些 CLI 后在本地 cwd 执行。
        </p>
        <div className="runtime-meta">
          {runtimes.length} 个 CLI · {installed} 个已安装 · cwd=
          {machine.cwd ?? '（未配置 MA_WORKSPACE_CWD）'}
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
          <Link
            href="/agents?ready=runtime_missing"
            className="btn-ghost btn-sm"
            data-testid="runtimes-to-agents-missing"
          >
            CLI 缺失
          </Link>
          <Link
            href="/runs?status=failed"
            className="btn-ghost btn-sm"
            data-testid="runtimes-to-failed-runs"
          >
            失败运行
          </Link>
        </div>
        {!machine.cwd ? (
          <div className="runtime-cwd-banner" data-testid="runtimes-cwd-banner" role="status">
            <strong>工作区 cwd 未配置</strong>
            <span className="text-sm"> CLI 即使已安装，派活仍可能立刻失败。</span>
            <div className="runtime-banner-actions">
              <Link href="/settings" className="btn-secondary btn-sm" data-testid="runtimes-cwd-to-settings">
                去设置
              </Link>
              <Link
                href="/agents?ready=cwd_missing"
                className="btn-ghost btn-sm"
                data-testid="runtimes-cwd-to-agents"
              >
                智能体 cwd
              </Link>
              <Link
                href="/runs?status=failed"
                className="btn-ghost btn-sm"
                data-testid="runtimes-cwd-to-failed"
              >
                失败运行
              </Link>
            </div>
          </div>
        ) : null}
        {runtimes.some((r) => !r.installed) ? (
          <div className="runtime-missing-banner" data-testid="runtimes-missing-banner" role="status">
            <strong>有本机 CLI 未检测到</strong>
            <span className="text-sm">
              {' '}
              {runtimes.filter((r) => !r.installed).map((r) => r.label).join('、')}
              。安装并加入 PATH 后点「重新探测」。
            </span>
            <div className="runtime-banner-actions">
              <Link
                href="/agents?ready=runtime_missing"
                className="btn-secondary btn-sm"
                data-testid="runtimes-missing-to-agents"
              >
                受影响智能体
              </Link>
              <Link href="/settings" className="btn-ghost btn-sm" data-testid="runtimes-missing-to-settings">
                环境诊断
              </Link>
            </div>
          </div>
        ) : null}

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>本机 CLI</th>
                <th>探测</th>
                <th>智能体</th>
                <th>费用 - 7天</th>
                <th>版本 / 路径</th>
              </tr>
            </thead>
            <tbody>
              {runtimes.map((rt) => (
                <tr
                  key={rt.id}
                  data-testid="runtime-row"
                  data-runtime={rt.id}
                  data-installed={rt.installed ? '1' : '0'}
                >
                  <td>
                    <span className="runtime-type-icon">
                      <Icon name="bot" size={14} />
                    </span>
                    {rt.label} <span className="runtime-internal">[适配器]</span>
                  </td>
                  <td>
                    {rt.installed ? (
                      <span className="status-online">
                        <span className="status-dot-green" /> 已安装
                      </span>
                    ) : (
                      <span className="status-offline">未检测到</span>
                    )}
                  </td>
                  <td>
                    {rt.agentIds.length ? (
                      <Link
                        href={`/agents?runtime=${encodeURIComponent(rt.id)}`}
                        className="runtimes-agent-count-link"
                        data-testid="runtime-agents-link"
                        data-runtime={rt.id}
                        title={`筛选 ${rt.label} 智能体`}
                      >
                        {rt.agentIds.length} 个
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
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
