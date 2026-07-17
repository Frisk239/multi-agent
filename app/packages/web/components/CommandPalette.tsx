'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIssues } from '@/lib/api';

export type CommandPaletteOpenRequest = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

type Command = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

// S12：Ctrl+K 命令面板——导航已实现路由 + 新建 Issue + 最近 issues 过滤
export function CommandPalette({ open, setOpen }: CommandPaletteOpenRequest) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data: issues = [] } = useIssues();

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
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
      // 非输入框时忽略普通键；Ctrl+K 已处理
      void typing;
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      {
        id: 'nav-issues',
        label: 'Issues',
        hint: '/',
        run: () => router.push('/'),
      },
      {
        id: 'nav-inbox',
        label: 'Inbox',
        hint: '/inbox',
        run: () => router.push('/inbox'),
      },
      {
        id: 'nav-squads',
        label: '小队',
        hint: '/squads',
        run: () => router.push('/squads'),
      },
      {
        id: 'nav-agents',
        label: '智能体',
        hint: '/agents',
        run: () => router.push('/agents'),
      },
      {
        id: 'nav-wiki',
        label: 'Wiki',
        hint: '/wiki',
        run: () => router.push('/wiki'),
      },
      {
        id: 'nav-memory',
        label: '记忆',
        hint: '/memory',
        run: () => router.push('/memory'),
      },
      {
        id: 'nav-runtimes',
        label: '运行时',
        hint: '/runtimes',
        run: () => router.push('/runtimes'),
      },
      {
        id: 'nav-skills',
        label: 'Skills',
        hint: '/skills',
        run: () => router.push('/skills'),
      },
      {
        id: 'new-issue',
        label: '新建 Issue',
        hint: '/?new=1',
        run: () => router.push('/?new=1'),
      },
    ];

    const q = query.trim().toLowerCase();
    const issueCmds = issues
      .filter((i) => {
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.identifier.toLowerCase().includes(q)
        );
      })
      .slice(0, 8)
      .map((i) => ({
        id: `issue-${i.id}`,
        label: `${i.identifier} · ${i.title}`,
        hint: i.status,
        run: () => router.push(`/issues/${i.id}`),
      }));

    const filteredNav = nav.filter((c) => {
      if (!q) return true;
      return c.label.toLowerCase().includes(q) || (c.hint ?? '').toLowerCase().includes(q);
    });

    // 有查询时优先展示 issue 匹配；导航仍保留
    return [...filteredNav, ...issueCmds];
  }, [issues, query, router]);

  if (!open) return null;

  function runCommand(cmd: Command) {
    setOpen(false);
    cmd.run();
  }

  return (
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
          placeholder="搜索命令或 Issue…"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && commands[0]) {
              e.preventDefault();
              runCommand(commands[0]);
            }
          }}
        />
        <ul className="cmdk-list">
          {commands.length === 0 ? (
            <li className="cmdk-empty">无匹配项</li>
          ) : (
            commands.map((cmd) => (
              <li key={cmd.id}>
                <button
                  type="button"
                  className="cmdk-item"
                  onClick={() => runCommand(cmd)}
                >
                  <span>{cmd.label}</span>
                  {cmd.hint ? <span className="cmdk-hint">{cmd.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="cmdk-footer">
          <span>Enter 执行</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
