'use client';
import { useState } from 'react';
import { useSkills, useRefreshSkills } from '@/lib/api';

// 照原型 renderSkills（app.js:619）：
// 页头（count + 重新扫描）+ 搜索框 + 表格 4 列。
// 原型第 4 列是「更新时间」，但 skill 是文件系统真源（无 mtime），用 description 替代（impl-3 handoff 偏离记录）。
export function SkillsPage() {
  const { data, isFetching } = useSkills();
  const refresh = useRefreshSkills();
  const [search, setSearch] = useState('');

  if (!data) return <div className="page-container">加载中…</div>;

  const filtered = search
    ? data.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : data;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            Skills <span className="count">{data.length}</span>
          </div>
          <div className="page-desc">工作区里任何智能体都能使用的指令。</div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            重新扫描
          </button>
        </div>
      </div>

      <div className="table-search">
        <input
          type="search"
          placeholder="搜索 skill..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>被谁使用</th>
              <th>来源</th>
              <th>简介</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((sk) => (
              <tr key={sk.name}>
                <td>
                  <strong>{sk.name}</strong>
                </td>
                <td>
                  {sk.usedBy.length > 0 ? (
                    sk.usedBy.map((a) => (
                      <span key={a.id} className="skill-tag">
                        {a.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-dim">— 未使用</span>
                  )}
                </td>
                <td>
                  <span className={`source-badge source-${sk.source}`}>
                    {sk.source === 'project' ? '项目级' : '用户级'}
                  </span>
                </td>
                <td className="text-dim text-sm">{sk.description || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-dim" style={{ textAlign: 'center' }}>
                  {isFetching ? '加载中…' : '没有匹配的 skill'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

