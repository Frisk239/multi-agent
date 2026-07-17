'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AgentReadiness, CreateAgentInput, RuntimeId } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateAgent,
  useDeleteAgent,
} from '@/lib/api';
import { Icon } from './Icon';

const RUNTIMES: RuntimeId[] = ['claude-code', 'opencode', 'cursor'];

type ReadyFilter =
  | ''
  | 'ready'
  | 'busy'
  | 'cwd_missing'
  | 'runtime_missing'
  | 'error'
  | 'blocked';

const READY_OPTIONS: { value: ReadyFilter; label: string }[] = [
  { value: '', label: '全部就绪态' },
  { value: 'ready', label: 'ready' },
  { value: 'busy', label: 'busy' },
  { value: 'cwd_missing', label: 'cwd 未配置' },
  { value: 'runtime_missing', label: 'runtime 缺失' },
  { value: 'error', label: 'error' },
  { value: 'blocked', label: '不可用（非 ready）' },
];

function readinessLabel(rd: AgentReadiness | null | undefined): string {
  if (!rd) return '…';
  if (rd.status === 'ready') return 'ready';
  if (rd.status === 'busy') return 'busy';
  if (rd.status === 'cwd_missing') return 'cwd 未配置';
  if (rd.status === 'runtime_missing') return 'runtime 缺失';
  return rd.status;
}

function readinessClass(status: AgentReadiness['status'] | undefined): string {
  if (status === 'ready') return 'readiness-chip readiness-ready readiness-chip-inline';
  if (status === 'busy') return 'readiness-chip readiness-busy readiness-chip-inline';
  return 'readiness-chip readiness-missing readiness-chip-inline';
}

function parseReady(raw: string | null): ReadyFilter {
  if (
    raw === 'ready' ||
    raw === 'busy' ||
    raw === 'cwd_missing' ||
    raw === 'runtime_missing' ||
    raw === 'error' ||
    raw === 'blocked'
  ) {
    return raw;
  }
  return '';
}

function readyChipLabel(ready: ReadyFilter): string {
  return READY_OPTIONS.find((o) => o.value === ready)?.label ?? ready;
}

// bu02 + readiness 列：列表 + 新建智能体；行点进详情；URL 可分享筛选
function AgentsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error } = useAgents();
  const create = useCreateAgent();
  const del = useDeleteAgent();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState<RuntimeId>('claude-code');
  const [category, setCategory] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [instructions, setInstructions] = useState('');

  const qFromUrl = searchParams.get('q') ?? '';
  const runtimeFromUrl = searchParams.get('runtime') ?? '';
  const readyFromUrl = parseReady(searchParams.get('ready'));
  const [qDraft, setQDraft] = useState(qFromUrl);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  function replaceParams(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // 防抖写 URL 搜索
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qDraft.trim();
      if (next === qFromUrl.trim()) return;
      replaceParams({ q: next || null });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only draft drives debounce
  }, [qDraft]);

  const agentIds = useMemo(() => (data ?? []).map((a) => a.id), [data]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(agentIds);

  const runtimeFilter =
    runtimeFromUrl === 'claude-code' ||
    runtimeFromUrl === 'opencode' ||
    runtimeFromUrl === 'cursor'
      ? runtimeFromUrl
      : '';

  const visible = useMemo(() => {
    const list = data ?? [];
    const q = qFromUrl.trim().toLowerCase();
    return list.filter((ag) => {
      if (runtimeFilter && ag.runtime !== runtimeFilter) return false;
      if (q) {
        const hay = `${ag.name} ${ag.category ?? ''} ${ag.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (readyFromUrl) {
        const st = readinessMap[ag.id]?.status;
        if (readyFromUrl === 'blocked') {
          if (!st || st === 'ready') return false;
        } else if (st !== readyFromUrl) {
          return false;
        }
      }
      return true;
    });
  }, [data, qFromUrl, runtimeFilter, readyFromUrl, readinessMap]);

  const hasActiveFilters = Boolean(qFromUrl.trim() || runtimeFilter || readyFromUrl);

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

  function clearAllFilters() {
    setQDraft('');
    router.replace(pathname, { scroll: false });
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
    <div className="page-container" data-testid="agents-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            智能体{' '}
            <span className="count" data-testid="agents-visible-count">
              {hasActiveFilters ? `${visible.length}/${agents.length}` : agents.length}
            </span>
          </div>
          <div className="page-desc">配置 runtime / 指令 / 并发，指派执行</div>
        </div>
        <div className="page-actions">
          <Link href="/runtimes" className="btn btn-ghost btn-sm" data-testid="agents-to-runtimes">
            运行时
          </Link>
          <Link href="/settings" className="btn btn-ghost btn-sm" data-testid="agents-to-settings">
            环境
          </Link>
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

      <div className="agents-filters" data-testid="agents-filters">
        <div className="table-search memory-search-wrap">
          <input
            type="search"
            placeholder="搜索名称 / 分类…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            data-testid="agents-search"
            aria-label="搜索智能体"
          />
          {qFromUrl.trim() ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              data-testid="agents-search-clear"
              onClick={() => {
                setQDraft('');
                replaceParams({ q: null });
              }}
            >
              清除
            </button>
          ) : null}
        </div>
        <label className="agents-filter-field">
          运行时
          <select
            value={runtimeFilter}
            data-testid="agents-runtime-filter"
            onChange={(e) => replaceParams({ runtime: e.target.value || null })}
            aria-label="按运行时筛选"
          >
            <option value="">全部</option>
            {RUNTIMES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="agents-filter-field">
          就绪
          <select
            value={readyFromUrl}
            data-testid="agents-ready-filter"
            onChange={(e) => replaceParams({ ready: e.target.value || null })}
            aria-label="按就绪态筛选"
          >
            {READY_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasActiveFilters ? (
        <div
          className="agents-active-filters"
          data-testid="agents-active-filters"
          aria-label="当前筛选"
        >
          {qFromUrl.trim() ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="agents-chip-q"
              onClick={() => {
                setQDraft('');
                replaceParams({ q: null });
              }}
            >
              搜索「{qFromUrl.trim()}」 ×
            </button>
          ) : null}
          {runtimeFilter ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="agents-chip-runtime"
              onClick={() => replaceParams({ runtime: null })}
            >
              运行时 · {runtimeFilter} ×
            </button>
          ) : null}
          {readyFromUrl ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="agents-chip-ready"
              onClick={() => replaceParams({ ready: null })}
            >
              就绪 · {readyChipLabel(readyFromUrl)} ×
            </button>
          ) : null}
          <button
            type="button"
            className="kanban-active-chip kanban-active-chip--clear"
            data-testid="agents-chip-clear-all"
            onClick={clearAllFilters}
          >
            清除全部
          </button>
        </div>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table" data-testid="agents-table">
          <thead>
            <tr>
              <th>智能体</th>
              <th>分类</th>
              <th>运行时</th>
              <th>就绪</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-dim" style={{ textAlign: 'center' }}>
                  暂无智能体，点「新建智能体」开始
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-dim" style={{ textAlign: 'center' }}>
                  <div data-testid="agents-empty-filter">
                    <div>没有匹配的智能体</div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        data-testid="agents-clear-filter"
                        onClick={clearAllFilters}
                      >
                        清除筛选
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((ag) => {
                const rd = readinessMap[ag.id];
                return (
                  <tr key={ag.id} data-agent-id={ag.id}>
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
                      <Link
                        href={`/agents?runtime=${encodeURIComponent(ag.runtime)}`}
                        className="agents-runtime-link"
                        data-testid="agent-list-runtime"
                        title={`筛选 runtime：${ag.runtime}`}
                      >
                        <code>{ag.runtime}</code>
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/agents?ready=${encodeURIComponent(rd?.status ?? 'error')}`}
                        className={readinessClass(rd?.status)}
                        data-testid="agent-list-readiness"
                        data-status={rd?.status ?? 'unknown'}
                        title={
                          rd?.detail
                            ? `${rd.detail} · 点击筛选同态`
                            : `筛选就绪态：${rd?.status ?? 'unknown'}`
                        }
                      >
                        {readinessLabel(rd)}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/?assignee=agent:${encodeURIComponent(ag.id)}`}
                        className="btn btn-ghost btn-sm"
                        data-testid="agent-list-board"
                      >
                        看板
                      </Link>{' '}
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AgentsPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <AgentsPageInner />
    </Suspense>
  );
}
