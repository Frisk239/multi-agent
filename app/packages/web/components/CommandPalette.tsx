'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAgents,
  useAgentsReadinessMap,
  useIssues,
  useRunsActiveCount,
  useSquads,
  useWikiPages,
} from '@/lib/api';
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

// S12：Ctrl+K；issue-find + wiki/memory/squad + 诊断入口
export function CommandPalette({ open, setOpen }: CommandPaletteOpenRequest) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [active, setActive] = useState(0);
  const [quickDispatchOpen, setQuickDispatchOpen] = useState(false);
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const { data: wikiPages = [] } = useWikiPages();
  const { data: activeRuns } = useRunsActiveCount();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const { data: remoteIssues = [], isFetching: issuesFetching } = useIssues(
    debouncedQ ? { q: debouncedQ } : undefined,
  );

  // 有查询时：为命中名称的 agent 拉 readiness 显示在 hint
  const matchedAgentIds = useMemo(() => {
    const q = debouncedQ.toLowerCase();
    if (!q) return [] as string[];
    return agents
      .filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
      .slice(0, 6)
      .map((a) => a.id);
  }, [agents, debouncedQ]);

  const { data: readinessMap = {} } = useAgentsReadinessMap(matchedAgentIds);

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
        id: 'nav-issues-failed',
        label: '仅失败 Issue',
        hint: '/?failed=1',
        group: '导航',
        run: () => router.push('/?failed=1'),
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
        id: 'nav-runs-active',
        label: '运行：活跃',
        hint:
          (activeRuns?.count ?? 0) > 0
            ? `/runs?status=active · ${activeRuns?.count}`
            : '/runs?status=active',
        group: '导航',
        run: () => router.push('/runs?status=active'),
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
        id: 'nav-settings-diag',
        label: '环境诊断',
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

    const readinessLabel = (status?: string | null) => {
      if (!status) return '…';
      if (status === 'ready') return 'ready';
      if (status === 'busy') return 'busy';
      if (status === 'cwd_missing') return 'cwd 未配置';
      if (status === 'runtime_missing') return 'runtime 缺失';
      return status;
    };

    const matchedAgents = !q
      ? []
      : agents
          .filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
          .slice(0, 6);
    const agentCmds = matchedAgents.flatMap((a) => {
      const rd = readinessMap[a.id];
      const st = readinessLabel(rd?.status);
      return [
        {
          id: `agent-${a.id}`,
          label: a.name,
          hint: `${st} · ${a.runtime}`,
          group: '智能体',
          run: () => router.push(`/agents/${a.id}`),
        },
        {
          id: `agent-board-${a.id}`,
          label: `看板：${a.name}`,
          hint: `/?assignee=agent:${a.id}`,
          group: '看板',
          run: () => router.push(`/?assignee=agent:${encodeURIComponent(a.id)}`),
        },
      ];
    });

    // 小队：名/id 匹配 → /squads/:id
    const matchedSquads = !q
      ? []
      : squads
          .filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q) ||
              q === 'squad' ||
              q === '小队',
          )
          .slice(0, 6);
    const squadCmds = matchedSquads.flatMap((s) => [
      {
        id: `squad-${s.id}`,
        label: s.name,
        hint: `/squads/${s.id}`,
        group: '小队',
        run: () => router.push(`/squads/${s.id}`),
      },
      {
        id: `squad-board-${s.id}`,
        label: `看板：${s.name}`,
        hint: `/?assignee=squad:${s.id}`,
        group: '看板',
        run: () => router.push(`/?assignee=squad:${encodeURIComponent(s.id)}`),
      },
      {
        id: `squad-runs-${s.id}`,
        label: `运行：${s.name}`,
        hint: `/runs?squad=${s.id}`,
        group: '运行',
        run: () => router.push(`/runs?squad=${encodeURIComponent(s.id)}`),
      },
    ]);

    const squadOpsHit =
      !q ||
      ['squad', '小队', '队长', 'leader', '就绪', 'cwd', 'blocked'].some((k) =>
        q.includes(k.toLowerCase()),
      );
    const squadOpsCmds = squadOpsHit
      ? [
          {
            id: 'squads-ready-cwd',
            label: '小队：队长 cwd 未配置',
            hint: '/squads?ready=cwd_missing',
            group: '小队',
            run: () => router.push('/squads?ready=cwd_missing'),
          },
          {
            id: 'squads-ready-blocked',
            label: '小队：队长不可用',
            hint: '/squads?ready=blocked',
            group: '小队',
            run: () => router.push('/squads?ready=blocked'),
          },
        ]
      : [];

    // Wiki：标题/slug 匹配 → /wiki?slug=
    const wikiCmds = !q
      ? []
      : wikiPages
          .filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              p.slug.toLowerCase().includes(q) ||
              q === 'wiki',
          )
          .slice(0, 6)
          .map((p) => ({
            id: `wiki-${p.slug}`,
            label: p.title,
            hint: `/wiki?slug=${p.slug}`,
            group: 'Wiki',
            run: () =>
              router.push(`/wiki?slug=${encodeURIComponent(p.slug)}`),
          }));

    const wikiOpsHit =
      q &&
      ['编译', 'wiki job', 'wikijob', 'dead job', 'ingest', 'wiki失败', 'wiki 失败'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const wikiOpsCmds = wikiOpsHit
      ? [
          {
            id: 'wiki-jobs-dead',
            label: 'Wiki：dead 编译任务',
            hint: '/wiki?jobStatus=dead',
            group: 'Wiki',
            run: () => router.push('/wiki?jobStatus=dead'),
          },
          {
            id: 'wiki-open',
            label: '打开 Wiki',
            hint: '/wiki',
            group: 'Wiki',
            run: () => router.push('/wiki'),
          },
        ]
      : [];

    // 记忆：有查询时提供搜索；命中关键词时再给「打开记忆页」
    const memoryKeyword =
      q &&
      ['记忆', 'memory', 'mem', '经验', 'curated', 'ambient'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const memoryKindCurated =
      q &&
      ['curated', '精选', '沉淀'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const memoryKindAmbient =
      q &&
      ['ambient', '旁路', '评论记忆'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const memoryCmds = [
      ...(q.length >= 1
        ? [
            {
              id: 'memory-search',
              label: `在记忆中搜索「${debouncedQ}」`,
              hint: `/memory?q=`,
              group: '记忆',
              run: () =>
                router.push(`/memory?q=${encodeURIComponent(debouncedQ)}`),
            },
          ]
        : []),
      ...(memoryKeyword
        ? [
            {
              id: 'memory-open',
              label: '打开记忆',
              hint: '/memory',
              group: '记忆',
              run: () => router.push('/memory'),
            },
          ]
        : []),
      ...(memoryKindCurated || memoryKeyword
        ? [
            {
              id: 'memory-kind-curated',
              label: '记忆：仅 curated',
              hint: '/memory?kind=curated',
              group: '记忆',
              run: () => router.push('/memory?kind=curated'),
            },
          ]
        : []),
      ...(memoryKindAmbient || (memoryKeyword && q.includes('ambient'))
        ? [
            {
              id: 'memory-kind-ambient',
              label: '记忆：仅 ambient',
              hint: '/memory?kind=ambient',
              group: '记忆',
              run: () => router.push('/memory?kind=ambient'),
            },
          ]
        : []),
    ];

    // 诊断：关键词命中时置顶一条
    const diagHit =
      q &&
      ['诊断', 'settings', '环境', 'cwd', 'llm', '配置'].some((k) =>
        q.includes(k.toLowerCase()) || debouncedQ.includes(k),
      );
    const runtimeHit =
      q &&
      ['runtime', '运行时', '探测', 'cli', 'claude', 'opencode', 'cursor'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const failedHit =
      q &&
      ['失败', 'failed', '挂了', '报错', 'error', 'fail'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const activeHit =
      q &&
      ['活跃', '在途', 'active', 'queued', 'running', '排队', '执行中'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const automationHit =
      q &&
      ['自动化', 'automation', '定时', 'schedule', 'cron', '规则', '巡检'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );

    const failedCmds = failedHit
      ? [
          {
            id: 'board-failed-only',
            label: '看板：仅失败 Issue',
            hint: '/?failed=1',
            group: '看板',
            run: () => router.push('/?failed=1'),
          },
          {
            id: 'runs-failed',
            label: '运行：仅 failed',
            hint: '/runs?status=failed',
            group: '看板',
            run: () => router.push('/runs?status=failed'),
          },
        ]
      : [];

    const activeCmds = activeHit
      ? [
          {
            id: 'runs-active',
            label: '运行：活跃 (queued+running)',
            hint:
              (activeRuns?.count ?? 0) > 0
                ? `/runs?status=active · ${activeRuns?.count}`
                : '/runs?status=active',
            group: '运行',
            run: () => router.push('/runs?status=active'),
          },
        ]
      : [];

    const automationCmds = automationHit
      ? [
          {
            id: 'automation-open',
            label: '打开自动化',
            hint: '/automation',
            group: '自动化',
            run: () => router.push('/automation'),
          },
          {
            id: 'automation-enabled-on',
            label: '自动化：仅已启用',
            hint: '/automation?enabled=on',
            group: '自动化',
            run: () => router.push('/automation?enabled=on'),
          },
          {
            id: 'automation-enabled-off',
            label: '自动化：仅已停用',
            hint: '/automation?enabled=off',
            group: '自动化',
            run: () => router.push('/automation?enabled=off'),
          },
          {
            id: 'automation-failed',
            label: '自动化：仅失败规则',
            hint: '/automation?failed=1',
            group: '自动化',
            run: () => router.push('/automation?failed=1'),
          },
          {
            id: 'automation-schedule-interval',
            label: '自动化：间隔调度',
            hint: '/automation?schedule=interval_minutes',
            group: '自动化',
            run: () => router.push('/automation?schedule=interval_minutes'),
          },
          {
            id: 'automation-schedule-daily',
            label: '自动化：每日调度',
            hint: '/automation?schedule=daily_at',
            group: '自动化',
            run: () => router.push('/automation?schedule=daily_at'),
          },
        ]
      : [];

    const originHit =
      q &&
      ['来源', 'origin', '快速派活', 'quick_create', 'qc', '自动创建'].some(
        (k) => q.includes(k.toLowerCase()) || debouncedQ.toLowerCase().includes(k),
      );
    const originCmds = originHit
      ? [
          {
            id: 'board-origin-automation-2',
            label: '看板：仅自动化 Issue',
            hint: '/?origin=automation',
            group: '看板',
            run: () => router.push('/?origin=automation'),
          },
          {
            id: 'board-origin-qc',
            label: '看板：仅快速派活 Issue',
            hint: '/?origin=quick_create',
            group: '看板',
            run: () => router.push('/?origin=quick_create'),
          },
        ]
      : [];

    const agentOpsHit =
      !q ||
      ['agent', '智能体', 'cwd', '就绪', 'readiness', 'blocked', 'runtime'].some((k) =>
        q.includes(k.toLowerCase()),
      );
    const agentOpsCmds = agentOpsHit
      ? [
          {
            id: 'agents-ready-cwd',
            label: '智能体：cwd 未配置',
            hint: '/agents?ready=cwd_missing',
            group: '智能体',
            run: () => router.push('/agents?ready=cwd_missing'),
          },
          {
            id: 'agents-ready-runtime',
            label: '智能体：runtime 缺失',
            hint: '/agents?ready=runtime_missing',
            group: '智能体',
            run: () => router.push('/agents?ready=runtime_missing'),
          },
          {
            id: 'agents-ready-blocked',
            label: '智能体：不可用',
            hint: '/agents?ready=blocked',
            group: '智能体',
            run: () => router.push('/agents?ready=blocked'),
          },
          {
            id: 'agents-rt-claude',
            label: '智能体：claude-code',
            hint: '/agents?runtime=claude-code',
            group: '智能体',
            run: () => router.push('/agents?runtime=claude-code'),
          },
          {
            id: 'agents-rt-opencode',
            label: '智能体：opencode',
            hint: '/agents?runtime=opencode',
            group: '智能体',
            run: () => router.push('/agents?runtime=opencode'),
          },
          {
            id: 'agents-rt-cursor',
            label: '智能体：cursor',
            hint: '/agents?runtime=cursor',
            group: '智能体',
            run: () => router.push('/agents?runtime=cursor'),
          },
        ]
      : [];

    const diagCmds = [
      ...(diagHit
        ? [
            {
              id: 'diag-settings',
              label: '打开环境诊断',
              hint: '/settings',
              group: '诊断',
              run: () => router.push('/settings'),
            },
          ]
        : []),
      ...(runtimeHit || diagHit
        ? [
            {
              id: 'diag-runtimes',
              label: '运行时探测',
              hint: '/runtimes',
              group: '诊断',
              run: () => router.push('/runtimes'),
            },
          ]
        : []),
    ];

    // 有查询：活跃/失败/自动化 → Issues → 小队 → Wiki → 诊断 → Memory → Agents → 导航
    if (q) {
      return [
        ...activeCmds,
        ...failedCmds,
        ...originCmds,
        ...automationCmds,
        ...issueCmds,
        ...squadOpsCmds,
        ...squadCmds,
        ...wikiOpsCmds,
        ...wikiCmds,
        ...diagCmds,
        ...memoryCmds,
        ...agentOpsCmds,
        ...agentCmds,
        ...filteredNav,
      ];
    }
    return [...filteredNav, ...issueCmds];
  }, [
    agents,
    activeRuns?.count,
    squads,
    debouncedQ,
    remoteIssues,
    readinessMap,
    router,
    setOpen,
    wikiPages,
  ]);

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
              placeholder="搜索命令、Issue、Wiki、记忆或智能体…"
              autoFocus
              data-testid="cmdk-input"
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
