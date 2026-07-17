'use client';
import { useState } from 'react';
import {
  useMemoryStatus,
  useMemoryList,
  useCreateMemory,
} from '@/lib/api';

// S11 /memory 浏览器（spec §5）：页头 status + 搜索列表 + 新建
// 布局对齐 SkillsPage（page-header / table-search / data-table）
export function MemoryPage() {
  const { data: status } = useMemoryStatus();
  const [q, setQ] = useState('');
  const { data, isFetching, isError, error } = useMemoryList(q);
  const create = useCreateMemory();
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const statusLabel = status
    ? status.available
      ? [status.provider, status.backend].filter(Boolean).join(' / ')
      : `${status.provider ?? 'none'}（不可用）`
    : '…';

  async function handleCreate() {
    const text = draft.trim();
    if (!text) {
      setFormError('请输入记忆内容');
      return;
    }
    setFormError(null);
    try {
      await create.mutateAsync({ text });
      setDraft('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '创建失败');
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            记忆 <span className="count">{data?.length ?? 0}</span>
          </div>
          <div className="page-desc">
            工作区经验记忆（curated + ambient）。provider：{statusLabel}
          </div>
        </div>
      </div>

      <div className="memory-create">
        <textarea
          className="memory-textarea"
          rows={3}
          placeholder="写入一条记忆…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={create.isPending}
        />
        <div className="memory-create-actions">
          {formError && <span className="text-dim text-sm">{formError}</span>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleCreate()}
            disabled={create.isPending || !draft.trim()}
          >
            {create.isPending ? '写入中…' : '写入记忆'}
          </button>
        </div>
      </div>

      <div className="table-search">
        <input
          type="search"
          placeholder="搜索记忆…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>内容</th>
              <th>Issue</th>
              <th>时间</th>
              <th>id</th>
            </tr>
          </thead>
          <tbody>
            {isError && (
              <tr>
                <td colSpan={4} className="text-dim" style={{ textAlign: 'center' }}>
                  {error instanceof Error ? error.message : '加载失败'}
                </td>
              </tr>
            )}
            {!isError &&
              data?.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="memory-text">{m.text}</div>
                  </td>
                  <td className="text-dim text-sm">
                    {m.issueId ? <code>{m.issueId}</code> : '—'}
                  </td>
                  <td className="text-dim text-sm">
                    {m.createdAt
                      ? new Date(m.createdAt).toLocaleString()
                      : '—'}
                  </td>
                  <td className="text-dim text-sm">
                    <code title={m.id}>{m.id.slice(0, 8)}…</code>
                  </td>
                </tr>
              ))}
            {!isError && data && data.length === 0 && (
              <tr>
                <td colSpan={4} className="text-dim" style={{ textAlign: 'center' }}>
                  {isFetching ? '加载中…' : '没有匹配的记忆'}
                </td>
              </tr>
            )}
            {!isError && !data && (
              <tr>
                <td colSpan={4} className="text-dim" style={{ textAlign: 'center' }}>
                  加载中…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
