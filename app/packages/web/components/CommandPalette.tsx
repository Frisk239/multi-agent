'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgents, useIssues } from '@/lib/api';
import { QuickDispatchPanel } from './QuickDispatchPanel';

export type CommandPaletteOpenRequest = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

type Command = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  run: () => void;
};

// S12：Ctrl+K；issue-find：服务端 Issue 搜 + Agents + 键盘上下
export function CommandPalette({ open, setOpen }: CommandPaletteOpenRequest) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [active, setActive] = useState(0);
  const [quickDispatchOpen, setQuickDispatchOpen] = useState(false);
  const { data: agents = [] } = useAgents();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const { data: remoteIssues = [], isFetching: issuesFetching } = useIssues(
    debouncedQ ? { q: debouncedQ } : undefined,
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setOpen(false);
        setQuickDispatchOpen(true);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQ('');
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      {
        id: 'nav-issues',
        label: 'Issues',
        hint: '/',
        group: '导航',
        run: () => router.push('/'),
      },
      {
        id: 'nav-inbox',
        label: 'Inbox',
        hint: '/inbox',
        group: '导航',
        run: () => router.push('/inbox'),
      },
      {
        id: 'nav-squads',
        label: '小队',
        hint: '/squads',
        group: '导航',
        run: () => router.push('/squads'),
      },
      {
        id: 'nav-agents',
        label: '智能体',
        hint: '/agents',
        group: '导航',
        run: () => router.push('/agents'),
      },
      {
        id: 'nav-wiki',
        label: 'Wiki',
        hint: '/wiki',
        group: '导航',
        run: () => router.push('/wiki'),
      },
      {
        id: 'nav-memory',
        label: '记忆',
        hint: '/memory',
        group: '导航',
        run: () => router.push('/memory'),
      },
      {
        id: 'nav-runs',
        label: '运行',
        hint: '/runs',
        group: '导航',
        run: () => router.push('/runs'),
      },
      {
        id: 'nav-automation',
        label: '自动化',
        hint: '/automation',
        group: '导航',
        run: () => router.push('/automation'),
      },
      {
        id: 'nav-runtimes',
        label: '运行时',
        hint: '/runtimes',
        group: '导航',
        run: () => router.push('/runtimes'),
      },
      {
        id: 'nav-skills',
        label: 'Skills',
        hint: '/skills',
        group: '导航',
        run: () => router.push('/skills'),
      },
      {
        id: 'nav-settings',
        label: '设置',
        hint: '/settings',
        group: '导航',
        run: () => router.push('/settings'),
      },
      {
        id: 'new-issue',
        label: '新建 Issue',
        hint: '/?new=1',
        group: '导航',
        run: () => router.push('/?new=1'),
      },
      {
        id: 'quick-dispatch',
        label: '快速派活',
        hint: 'Q',
        group: '导航',
        run: () => {
          setOpen(false);
          setQuickDispatchOpen(true);
        },
      },
    ];

    const q = debouncedQ.toLowerCase();
    const filteredNav = nav.filter((c) => {
      if (!q) return true;
      return c.label.toLowerCase().includes(q) || (c.hint ?? '').toLowerCase().includes(q);
    });

    // 无查询：本地全量 issues 前 8 条作「最近」；有查询：服务端结果
    const issueSource = debouncedQ
      ? remoteIssues
      : remoteIssues; // useIssues() 无参时为全量
    const issueCmds = issueSource
      .slice(0, 8)
      .map((i) => ({
        id: `issue-${i.id}`,
        label: `${i.identifier} · ${i.title}`,
        hint: [
          i.status,
          ...(i.labels ?? []).slice(0, 2).map((l) => l.name),
        ]
          .filter(Boolean)
          .join(' · '),
        group: 'Issues',
        run: () => router.push(`/issues/${i.id}`),
      }));

    const agentCmds = !q
      ? []
      : agents
          .filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
          .slice(0, 6)
          .map((a) => ({
            id: `agent-${a.id}`,
            label: a.name,
            hint: a.id,
            group: '智能体',
            run: () => router.push(`/agents/${a.id}`),
          }));

    // 有查询：Issues 优先，再 Agents，再导航
    if (q) {
      return [...issueCmds, ...agentCmds, ...filteredNav];
    }
    return [...filteredNav, ...issueCmds];
  }, [agents, debouncedQ, remoteIssues, router, setOpen]);

  useEffect(() => {
    setActive(0);
  }, [debouncedQ, commands.length]);

  if (!open && !quickDispatchOpen) return null;

  function runCommand(cmd: Command) {
    setOpen(false);
    cmd.run();
  }

  return (
    <>
      {open && (
        <div
          className="cmdk-overlay"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="cmdk-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="命令面板"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="cmdk-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索命令、Issue 或智能体…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, Math.max(commands.length - 1, 0)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter' && commands[active]) {
                  e.preventDefault();
                  runCommand(commands[active]);
                }
              }}
            />
            <ul className="cmdk-list">
              {commands.length === 0 ? (
                <li className="cmdk-empty">
                  {issuesFetching ? '搜索中…' : '无匹配项'}
                </li>
              ) : (
                commands.map((cmd, idx) => (
                  <li key={cmd.id}>
                    <button
                      type="button"
                      className={`cmdk-item${idx === active ? ' is-active' : ''}`}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => runCommand(cmd)}
                    >
                      <span className="cmdk-item-main">
                        {cmd.group ? (
                          <span className="cmdk-group-tag">{cmd.group}</span>
                        ) : null}
                        <span>{cmd.label}</span>
                      </span>
                      {cmd.hint ? <span className="cmdk-hint">{cmd.hint}</span> : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="cmdk-footer">
              <span>↑↓ 选择 · Enter 执行</span>
              <span>Esc 关闭</span>
            </div>
          </div>
        </div>
      )}
      <QuickDispatchPanel
        open={quickDispatchOpen}
        onClose={() => setQuickDispatchOpen(false)}
      />
    </>
  );
}
