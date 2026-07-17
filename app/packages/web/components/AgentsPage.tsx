'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CreateAgentInput, RuntimeId } from '@ma/shared';
import { useAgents, useCreateAgent, useDeleteAgent } from '@/lib/api';
import { Icon } from './Icon';

const RUNTIMES: RuntimeId[] = ['claude-code', 'opencode', 'cursor'];

// bu02：列表 + 新建智能体；行点进详情；可选删除
export function AgentsPage() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useAgents();
  const create = useCreateAgent();
  const del = useDeleteAgent();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState<RuntimeId>('claude-code');
  const [category, setCategory] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [instructions, setInstructions] = useState('');

  function resetForm() {
    setName('');
    setRuntime('claude-code');
    setCategory('');
    setConcurrency(1);
    setInstructions('');
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const input: CreateAgentInput = {
      name: name.trim(),
      runtime,
      category: category.trim() ? category.trim() : null,
      concurrency,
      instructions,
    };
    create.mutate(input, {
      onSuccess: (agent) => {
        resetForm();
        router.push(`/agents/${agent.id}`);
      },
    });
  }

  function handleDelete(id: string, label: string) {
    if (!window.confirm(`确定删除智能体「${label}」？`)) return;
    del.mutate(id);
  }

  if (isLoading) return <div className="page-container">加载中…</div>;
  if (isError) {
    return (
      <div className="page-container">
        <p className="text-dim">{error instanceof Error ? error.message : '加载失败'}</p>
      </div>
    );
  }

  const agents = data ?? [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            智能体 <span className="count">{agents.length}</span>
          </div>
          <div className="page-desc">配置 runtime / 指令 / 并发，指派执行</div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '收起' : '新建智能体'}
          </button>
        </div>
      </div>

      {open && (
        <form className="ops-form" onSubmit={submit}>
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>名称</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：补2 测试员"
                required
                autoFocus
              />
            </label>
            <label className="ops-field">
              <span>运行时</span>
              <select
                value={runtime}
                onChange={(e) => setRuntime(e.target.value as RuntimeId)}
              >
                {RUNTIMES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>分类</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="可选"
              />
            </label>
            <label className="ops-field">
              <span>并发</span>
              <input
                type="number"
                min={1}
                max={8}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
              />
            </label>
          </div>
          <label className="ops-field">
            <span>Instructions</span>
            <textarea
              className="ops-textarea"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="执行时注入 prompt 的 agent 级指令（可选）"
            />
          </label>
          <div className="ops-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? '创建中…' : '创建'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              取消
            </button>
          </div>
        </form>
      )}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>智能体</th>
              <th>分类</th>
              <th>运行时</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-dim" style={{ textAlign: 'center' }}>
                  暂无智能体，点「新建智能体」开始
                </td>
              </tr>
            ) : (
              agents.map((ag) => (
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
                  <td className="text-dim">{ag.category || '—'}</td>
                  <td>
                    <code>{ag.runtime}</code>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={del.isPending}
                      onClick={() => handleDelete(ag.id, ag.name)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
