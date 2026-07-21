'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Issue, IssueStatus, Priority } from '@ma/shared';
import { IssueStatus as IssueStatusEnum, Priority as PriorityEnum } from '@ma/shared';
import {
  useAgents,
  useDeleteIssue,
  useSquads,
  useUpdateIssue,
} from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';

const ALL_STATUS = IssueStatusEnum.options;
const ALL_PRIORITY = PriorityEnum.options;

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

const PRIORITY_ZH: Record<Priority, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
  none: '无',
};

type SubKey = 'status' | 'priority' | 'assignee' | null;

type MenuState = {
  x: number;
  y: number;
  source: 'context' | 'menu';
};

/**
 * Multica board：卡片右键 / ⋯ 打开 Issue 管理菜单
 * （状态 / 优先级 / 负责人 / 复制链接 / 删除）
 * 参考 references/repos/multica/packages/views/issues/actions/*
 */
export function IssueCardMenu({
  issue,
  children,
}: {
  issue: Issue;
  children: ReactNode;
}) {
  const update = useUpdateIssue();
  const del = useDeleteIssue();
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sub, setSub] = useState<SubKey>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setMenu(null);
    setSub(null);
  }, []);

  const openAt = useCallback((x: number, y: number, source: MenuState['source']) => {
    const pad = 8;
    const mw = 220;
    const mh = 340;
    const nx = Math.min(Math.max(pad, x), window.innerWidth - mw - pad);
    const ny = Math.min(Math.max(pad, y), window.innerHeight - mh - pad);
    setMenu({ x: nx, y: ny, source });
    setSub(null);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-issue-menu-trigger="1"]')) {
        return;
      }
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [menu, close]);

  const currentAssigneeValue = useMemo(() => {
    if (issue.assignee?.type === 'agent') return `agent:${issue.assignee.id}`;
    if (issue.assignee?.type === 'squad') return `squad:${issue.assignee.id}`;
    return '';
  }, [issue.assignee]);

  const setStatus = (status: IssueStatus) => {
    if (status === issue.status) {
      close();
      return;
    }
    update.mutate({ id: issue.id, input: { status } });
    close();
  };

  const setPriority = (priority: Priority) => {
    if (priority === issue.priority) {
      close();
      return;
    }
    update.mutate({ id: issue.id, input: { priority } });
    close();
  };

  const setAssignee = (value: string) => {
    if (value === currentAssigneeValue) {
      close();
      return;
    }
    if (value === '') {
      if (!window.confirm('清除指派并停止当前运行？')) return;
      update.mutate({ id: issue.id, input: { assignee: null } });
      close();
      return;
    }
    if (value.startsWith('agent:')) {
      const id = value.slice('agent:'.length);
      const ag = agents.find((a) => a.id === id);
      if (!ag) return;
      if (
        !window.confirm(
          `将用 ${ag.runtime} 启动 ${ag.name}，可随时停止。继续？`,
        )
      ) {
        return;
      }
      update.mutate({
        id: issue.id,
        input: { assignee: { type: 'agent', id } },
      });
      close();
      return;
    }
    if (value.startsWith('squad:')) {
      const id = value.slice('squad:'.length);
      const sq = squads.find((s) => s.id === id);
      if (!sq) return;
      if (
        !window.confirm(
          `将启动小队「${sq.name}」：队长被执行并 briefing 委派成员。可随时停止。继续？`,
        )
      ) {
        return;
      }
      update.mutate({
        id: issue.id,
        input: { assignee: { type: 'squad', id } },
      });
      close();
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/issues/${issue.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess('已复制链接');
    } catch {
      toastError('复制失败');
    }
    close();
  };

  const openDetail = () => {
    close();
    window.location.href = `/issues/${issue.id}`;
  };

  const deleteIssue = () => {
    const label = issue.identifier || issue.title;
    if (
      !window.confirm(
        `确定删除 ${label}「${issue.title}」？\n关联评论将删除；运行记录保留（解除 issue 关联）。不可恢复。`,
      )
    ) {
      return;
    }
    del.mutate(issue.id);
    close();
  };

  return (
    <div
      ref={rootRef}
      className="issue-card-menu-shell"
      data-testid="issue-card-menu-shell"
      data-issue-id={issue.id}
      data-menu-open={menu ? '1' : '0'}
      onContextMenu={(e) => {
        // 链接/按钮上的右键仍允许系统菜单时可选；统一为 issue 管理
        e.preventDefault();
        e.stopPropagation();
        openAt(e.clientX, e.clientY, 'context');
      }}
    >
      {children}
      <button
        type="button"
        className="issue-card-menu-trigger"
        aria-label="Issue 管理"
        title="管理"
        data-testid="issue-card-menu-trigger"
        data-issue-menu-trigger="1"
        data-open={menu ? '1' : '0'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          openAt(r.right - 8, r.bottom + 4, 'menu');
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        draggable={false}
      >
        ⋯
      </button>

      {menu ? (
        <div
          ref={panelRef}
          className="issue-card-menu"
          role="menu"
          data-testid="issue-card-menu"
          data-source={menu.source}
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            className={`issue-card-menu-item issue-card-menu-item--sub${sub === 'status' ? ' is-open' : ''}`}
            role="menuitem"
            onClick={() => setSub(sub === 'status' ? null : 'status')}
          >
            <span>状态</span>
            <span className="issue-card-menu-meta">
              {STATUS_ZH[issue.status]}
              <span className="issue-card-menu-chevron">›</span>
            </span>
          </button>
          {sub === 'status' ? (
            <div className="issue-card-menu-sub" role="group" aria-label="状态">
              {ALL_STATUS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={issue.status === s}
                  className={`issue-card-menu-item${issue.status === s ? ' is-active' : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_ZH[s]}
                  {issue.status === s ? (
                    <span className="issue-card-menu-check">✓</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className={`issue-card-menu-item issue-card-menu-item--sub${sub === 'priority' ? ' is-open' : ''}`}
            role="menuitem"
            onClick={() => setSub(sub === 'priority' ? null : 'priority')}
          >
            <span>优先级</span>
            <span className="issue-card-menu-meta">
              {PRIORITY_ZH[issue.priority]}
              <span className="issue-card-menu-chevron">›</span>
            </span>
          </button>
          {sub === 'priority' ? (
            <div className="issue-card-menu-sub" role="group" aria-label="优先级">
              {ALL_PRIORITY.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="menuitemradio"
                  aria-checked={issue.priority === p}
                  className={`issue-card-menu-item${issue.priority === p ? ' is-active' : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {PRIORITY_ZH[p]}
                  {issue.priority === p ? (
                    <span className="issue-card-menu-check">✓</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className={`issue-card-menu-item issue-card-menu-item--sub${sub === 'assignee' ? ' is-open' : ''}`}
            role="menuitem"
            onClick={() => setSub(sub === 'assignee' ? null : 'assignee')}
          >
            <span>负责人</span>
            <span className="issue-card-menu-meta">
              {issue.assignee?.label ?? '未指派'}
              <span className="issue-card-menu-chevron">›</span>
            </span>
          </button>
          {sub === 'assignee' ? (
            <div
              className="issue-card-menu-sub issue-card-menu-sub--scroll"
              role="group"
              aria-label="负责人"
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!issue.assignee}
                className={`issue-card-menu-item${!issue.assignee ? ' is-active' : ''}`}
                onClick={() => setAssignee('')}
              >
                未指派
                {!issue.assignee ? (
                  <span className="issue-card-menu-check">✓</span>
                ) : null}
              </button>
              {agents.length > 0 ? (
                <div className="issue-card-menu-group-label">智能体</div>
              ) : null}
              {agents.map((a) => {
                const v = `agent:${a.id}`;
                const active = currentAssigneeValue === v;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`issue-card-menu-item${active ? ' is-active' : ''}`}
                    onClick={() => setAssignee(v)}
                  >
                    {a.name}
                    {active ? <span className="issue-card-menu-check">✓</span> : null}
                  </button>
                );
              })}
              {squads.length > 0 ? (
                <div className="issue-card-menu-group-label">小队</div>
              ) : null}
              {squads.map((s) => {
                const v = `squad:${s.id}`;
                const active = currentAssigneeValue === v;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`issue-card-menu-item${active ? ' is-active' : ''}`}
                    onClick={() => setAssignee(v)}
                  >
                    {s.name}
                    {active ? <span className="issue-card-menu-check">✓</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="issue-card-menu-sep" role="separator" />

          <button
            type="button"
            className="issue-card-menu-item"
            role="menuitem"
            onClick={() => void copyLink()}
          >
            复制链接
          </button>
          <button
            type="button"
            className="issue-card-menu-item"
            role="menuitem"
            onClick={openDetail}
          >
            打开详情
          </button>

          <div className="issue-card-menu-sep" role="separator" />

          <button
            type="button"
            className="issue-card-menu-item issue-card-menu-item--danger"
            role="menuitem"
            data-testid="issue-card-menu-delete"
            disabled={del.isPending}
            onClick={deleteIssue}
          >
            {del.isPending ? '删除中…' : '删除 issue'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
