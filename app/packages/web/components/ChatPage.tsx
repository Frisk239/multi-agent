'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AgentRun } from '@ma/shared';
import {
  API,
  apiFetch,
  useAgents,
  useArchiveChatThread,
  useCancelRun,
  useChatExecContext,
  useChatMessages,
  useChatThreads,
  useCreateChatThread,
  useDeleteChatThread,
  usePinChatThread,
  usePostChatMessage,
  useProjects,
  useUpdateChatThread,
  useUpdateChatThreadProject,
} from '@/lib/api';
import { isNearBottom, NEAR_BOTTOM_PX } from '@/lib/chat-scroll';
import { confirmDialog } from '@/lib/confirm-store';
import { draftKey, usePersistentDraft } from '@/lib/draft-storage';
import { useChatLiveState } from '@/lib/chat-live-state';
import { MarkdownBody } from './MarkdownBody';
import { EmptyState } from './EmptyState';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorState } from './ErrorState';
import { Select } from './Select';
import { Skeleton } from './Skeleton';



function initials(name: string): string {
  const s = name.trim();
  if (!s) return 'A';
  const parts = s.replace(/[·•]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString();
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

/** 会话头展示：截断绝对路径中间 */
function truncatePath(path: string, max = 48): string {
  const p = path.trim();
  if (p.length <= max) return p;
  const keep = Math.floor((max - 1) / 2);
  return `${p.slice(0, keep)}…${p.slice(-keep)}`;
}

/**
 * 聊天页：对齐 Multica 会话列表 + 主区。
 * 关键修复：WS 终态刷 messages；展示「思考中」进度与最近失败原因（避免静默卡死感）。
 */
export function ChatPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const threadId = searchParams.get('thread') ?? '';
  const [showArchived, setShowArchived] = useState(false);

  const { data: agents = [] } = useAgents();
  const { data: projects = [] } = useProjects();
  const {
    data: threads = [],
    isLoading: threadsLoading,
    isError: threadsError,
    error: threadsErr,
    refetch: refetchThreads,
  } = useChatThreads({
    archived: showArchived,
  });
  const pinThread = usePinChatThread();
  const archiveThread = useArchiveChatThread();
  const updateThreadTitle = useUpdateChatThread();
  const deleteThread = useDeleteChatThread();
  const updateThreadProject = useUpdateChatThreadProject();
  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
    error: messagesErr,
    refetch: refetchMessages,
  } = useChatMessages(threadId || undefined);
  const { data: execContext } = useChatExecContext(threadId || undefined);
  const createThread = useCreateChatThread();
  const postMessage = usePostChatMessage(threadId || undefined);
  const cancelRun = useCancelRun();

  const {
    liveRun,
    failedRun: lastFailedRun,
    failure,
    progress: liveProgress,
    tool: liveTool,
    partial: livePartial,
  } = useChatLiveState(threadId || undefined);

  const agentFromUrl = searchParams.get('agent') ?? '';
  const [agentId, setAgentId] = useState('');
  const {
    value: draft,
    setValue: setDraft,
    clear: clearChatDraft,
  } = usePersistentDraft(threadId ? draftKey.chat(threadId) : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleSaveInFlight = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  /** 近底才吸底；上滑超阈值停止自动滚 */
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showNewMessagesBtn, setShowNewMessagesBtn] = useState(false);
  /** 流式更新用 auto，避免 smooth 排队卡顿 */
  const lastScrollLenRef = useRef(0);

  useEffect(() => {
    if (agentFromUrl && agents.some((a) => a.id === agentFromUrl)) {
      setAgentId(agentFromUrl);
      return;
    }
    if (!agentId && agents[0]?.id) setAgentId(agents[0].id);
  }, [agents, agentId, agentFromUrl]);

  // 切换 thread 重置 stick
  useEffect(() => {
    setStickToBottom(true);
    setShowNewMessagesBtn(false);
    lastScrollLenRef.current = 0;
  }, [threadId]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === threadId) ?? null,
    [threads, threadId],
  );

  // 切换会话不可带走上一条的编辑草稿；服务端刷新标题时则同步新真源。
  useEffect(() => {
    titleSaveInFlight.current = false;
    setEditingTitle(false);
  }, [threadId]);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(selectedThread?.title ?? '');
  }, [selectedThread?.title, editingTitle]);

  const agentById = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a]));
    return m;
  }, [agents]);

  const agentName = (id: string) => agentById.get(id)?.name ?? id;


  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesRef.current;
    if (!el) {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
      return;
    }
    if (behavior === 'smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const near = isNearBottom(el, NEAR_BOTTOM_PX);
    setStickToBottom(near);
    if (near) setShowNewMessagesBtn(false);
  }, []);

  // 近底才吸底；上滑超阈值停止自动滚，显示「↓ 新消息」
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    const prevHeight = lastScrollLenRef.current;
    const grew = el.scrollHeight > prevHeight + 2;
    lastScrollLenRef.current = el.scrollHeight;

    if (stickToBottom) {
      // 流式/频繁更新用 auto，避免 smooth 抖动
      const streaming = Boolean(liveProgress || liveTool || livePartial);
      scrollToBottom(streaming || prevHeight === 0 ? 'auto' : 'smooth');
      setShowNewMessagesBtn(false);
      return;
    }

    // 不 stick 且内容增高 → 提示有新消息
    if (grew && (messages.length > 0 || liveRun)) {
      setShowNewMessagesBtn(true);
    }
  }, [
    messages.length,
    threadId,
    liveRun?.id,
    liveProgress,
    liveTool,
    livePartial,
    lastFailedRun?.id,
    stickToBottom,
    scrollToBottom,
    liveRun,
  ]);

  function selectThread(id: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (id) sp.set('thread', id);
    else sp.delete('thread');
    sp.delete('agent');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function handleCreate() {
    if (!agentId) return;
    const t = await createThread.mutateAsync({ agentId });
    setPickerOpen(false);
    selectThread(t.id);
  }

  function startTitleEdit() {
    if (!selectedThread || updateThreadTitle.isPending) return;
    setTitleDraft(selectedThread.title);
    setEditingTitle(true);
  }

  function cancelTitleEdit() {
    titleSaveInFlight.current = false;
    setTitleDraft(selectedThread?.title ?? '');
    setEditingTitle(false);
  }

  async function saveTitleEdit() {
    const thread = selectedThread;
    if (!thread || titleSaveInFlight.current) return;
    const title = titleDraft.trim();
    if (!title || title === thread.title) {
      cancelTitleEdit();
      return;
    }

    titleSaveInFlight.current = true;
    try {
      await updateThreadTitle.mutateAsync({ id: thread.id, title });
      setEditingTitle(false);
    } catch {
      // hook 已给出服务端校验/网络 toast；保留草稿，用户可修正后重试。
    } finally {
      titleSaveInFlight.current = false;
    }
  }

  async function handleDeleteThread(id: string, title: string) {
    const ok = await confirmDialog({
      title: '永久删除会话？',
      description: `永久删除「${title}」及其消息？此操作不可恢复；带运行记录的会话会被保留。`,
      confirmLabel: '永久删除',
      variant: 'danger',
    });
    if (!ok) return;
    deleteThread.mutate(id, {
      onSuccess: () => {
        if (id === threadId) selectThread('');
      },
    });
  }

  async function checkGitDirty(projectId: string | null) {
    if (!projectId) return true;
    try {
      const res = await apiFetch(`${API}/projects/${projectId}/git-status`);
      if (res.ok) {
        const { status, count } = await res.json() as { status: string; count: number };
        if (status === 'dirty') {
          const ok = await confirmDialog({
            title: '工作区有未提交修改',
            description: `本地代码仓库存在未提交修改（${count} 个文件），派发 Agent 可能会修改/覆写相关代码。是否继续？`,
            confirmLabel: '仍要派发',
            variant: 'danger',
          });
          if (!ok) return false;
        }
      }
    } catch {
      // ignore
    }
    return true;
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body || !threadId || liveRun) return;
    if (!(await checkGitDirty(selectedThread?.projectId ?? null))) return;
    clearChatDraft();
    try {
      await postMessage.mutateAsync(body);
    } catch {
      // 发送失败：把正文写回当前 thread 草稿（避免用户丢字）
      setDraft(body);
    }
  }

  /** 重发上一条：取最近一条用户消息正文，再 POST 新 run */
  const lastUserBody = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role === 'user' && m.body.trim()) return m.body.trim();
    }
    return null;
  }, [messages]);

  async function handleResendLast() {
    if (!lastUserBody || !threadId || liveRun || postMessage.isPending) return;
    if (!(await checkGitDirty(selectedThread?.projectId ?? null))) return;
    await postMessage.mutateAsync(lastUserBody);
  }

  const selectedAgent = selectedThread
    ? agentById.get(selectedThread.agentId)
    : null;

  return (
    <ErrorBoundary resetKeys={[threadId]}>
      <div className="chat-page chat-page--multica" data-testid="chat-page">
      <div className="chat-split" data-testid="chat-split">
        {/* —— 左：会话列表（对齐 Multica） —— */}
        <aside className="chat-rail" data-testid="chat-thread-list">
          <div className="chat-rail-head">
            <h1 className="chat-rail-title">聊天</h1>
            <button
              type="button"
              className="chat-rail-new"
              data-testid="chat-new-thread"
              title="新建对话"
              aria-label="新建对话"
              disabled={!agents.length || createThread.isPending}
              onClick={() => setPickerOpen((v) => !v)}
            >
              +
            </button>
          </div>

          {pickerOpen ? (
            <div className="chat-new-panel" data-testid="chat-new-panel">
              <label className="chat-new-label">
                选择智能体
                <Select
                  className="chat-new-select"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  data-testid="chat-agent-select"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>
              <button
                type="button"
                className="chat-new-start"
                disabled={!agentId || createThread.isPending}
                onClick={() => void handleCreate()}
              >
                {createThread.isPending ? '创建中…' : '开始对话'}
              </button>
            </div>
          ) : null}

          <div className="chat-rail-body">
            <div className="chat-rail-scope" data-testid="chat-rail-scope">
              <button
                type="button"
                className={`chat-rail-scope-btn${!showArchived ? ' is-active' : ''}`}
                data-testid="chat-scope-active"
                onClick={() => setShowArchived(false)}
              >
                会话
              </button>
              <button
                type="button"
                className={`chat-rail-scope-btn${showArchived ? ' is-active' : ''}`}
                data-testid="chat-scope-archived"
                onClick={() => setShowArchived(true)}
              >
                已归档
              </button>
            </div>
            {threadsLoading ? (
              <div
                className="chat-rail-skeleton"
                data-testid="chat-threads-loading"
                aria-busy="true"
              >
                <Skeleton variant="rectangular" height={48} className="mb-2" />
                <Skeleton variant="rectangular" height={48} className="mb-2" />
                <Skeleton variant="rectangular" height={48} className="mb-2" />
              </div>
            ) : threadsError ? (
              <div className="chat-rail-error" data-testid="chat-threads-error">
                <ErrorState
                  title="加载会话失败"
                  description={
                    threadsErr instanceof Error ? threadsErr.message : '未知错误'
                  }
                  onRetry={() => void refetchThreads()}
                />
              </div>
            ) : threads.length === 0 ? (
              <div className="chat-rail-empty" data-testid="chat-threads-empty">
                <EmptyState
                  title={showArchived ? '没有已归档会话' : '还没有对话'}
                  description={
                    showArchived
                      ? '归档的会话会出现在这里'
                      : agents.length
                        ? '点右上角 + 与智能体开聊'
                        : '先创建智能体，再开新对话'
                  }
                  action={
                    showArchived ? undefined : agents.length ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        data-testid="chat-empty-new"
                        onClick={() => setPickerOpen(true)}
                      >
                        新建对话
                      </button>
                    ) : (
                      <Link
                        href="/agents"
                        className="btn btn-primary btn-sm"
                        data-testid="chat-empty-agents"
                      >
                        去选 Agent
                      </Link>
                    )
                  }
                />
              </div>
            ) : (
              <ul className="chat-threads">
                {threads.map((th) => {
                  const ag = agentById.get(th.agentId);
                  const name = ag?.name ?? th.agentId;
                  const pinned = Boolean(th.pinnedAt);
                  return (
                    <li
                      key={th.id}
                      className={`chat-thread-li${th.id === threadId ? ' is-active' : ''}${
                        pinned ? ' is-pinned' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className={`chat-thread-item${th.id === threadId ? ' is-active' : ''}`}
                        data-testid="chat-thread-item"
                        data-thread-id={th.id}
                        data-pinned={pinned ? '1' : '0'}
                        onClick={() => selectThread(th.id)}
                      >
                        <span className="chat-avatar" aria-hidden>
                          {initials(name)}
                        </span>
                        <span className="chat-thread-text">
                          <span className="chat-thread-title">
                            {pinned ? (
                              <span className="chat-pin-mark" title="已置顶" aria-hidden>
                                ★
                              </span>
                            ) : null}
                            {th.title}
                          </span>
                          <span className="chat-thread-preview">
                            {th.lastMessagePreview?.trim() || name}
                          </span>
                        </span>
                      </button>
                      <div className="chat-thread-actions" data-testid="chat-thread-actions">
                        <button
                          type="button"
                          className="chat-thread-action"
                          data-testid="chat-thread-pin"
                          title={pinned ? '取消置顶' : '置顶'}
                          aria-label={pinned ? '取消置顶' : '置顶'}
                          disabled={pinThread.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            pinThread.mutate({ id: th.id, pinned: !pinned });
                          }}
                        >
                          {pinned ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          className="chat-thread-action"
                          data-testid="chat-thread-archive"
                          title={showArchived ? '取消归档' : '归档'}
                          aria-label={showArchived ? '取消归档' : '归档'}
                          disabled={archiveThread.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextArchived = !showArchived;
                            archiveThread.mutate(
                              { id: th.id, archived: nextArchived },
                              {
                                onSuccess: () => {
                                  if (nextArchived && th.id === threadId) {
                                    selectThread('');
                                  }
                                },
                              },
                            );
                          }}
                        >
                          ▤
                        </button>
                        {showArchived ? (
                          <button
                            type="button"
                            className="chat-thread-action chat-thread-action--danger"
                            data-testid="chat-thread-delete"
                            title="永久删除"
                            aria-label="永久删除"
                            disabled={deleteThread.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteThread(th.id, th.title);
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* —— 右：对话区 —— */}
        <section className="chat-main" data-testid="chat-main">
          {!threadId || !selectedThread ? (
            <div className="chat-empty" data-testid="chat-empty">
              {threadsLoading ? (
                <div data-testid="chat-main-loading" aria-busy="true">
                  <Skeleton variant="rectangular" height={28} width="40%" className="mb-4" />
                  <Skeleton variant="text" lines={3} />
                </div>
              ) : threadsError ? (
                <div data-testid="chat-main-error">
                  <ErrorState
                    title="加载会话失败"
                    description={
                      threadsErr instanceof Error ? threadsErr.message : '未知错误'
                    }
                    onRetry={() => void refetchThreads()}
                  />
                </div>
              ) : (
                <EmptyState
                  className="chat-empty-card"
                  icon="✦"
                  title="和你的智能体对话"
                  description={
                    agents.length
                      ? '一对一聊天：默认在隔离目录跑 CLI。从左侧选会话，或点下方新建对话。'
                      : '还没有可用智能体。先创建或启用 Agent，再开聊。'
                  }
                  action={
                    agents.length ? (
                      <button
                        type="button"
                        className="chat-empty-cta"
                        data-testid="chat-empty-cta"
                        onClick={() => setPickerOpen(true)}
                      >
                        新建对话
                      </button>
                    ) : (
                      <Link
                        href="/agents"
                        className="chat-empty-cta"
                        data-testid="chat-empty-cta-agents"
                      >
                        去选 Agent
                      </Link>
                    )
                  }
                />
              )}
            </div>
          ) : (
            <>
              <header className="chat-main-head" data-testid="chat-main-head">
                <div className="chat-main-head-text">
                  <h2 className="chat-main-title" data-testid="chat-main-title">
                    {editingTitle ? (
                      <input
                        className="chat-main-title-input"
                        data-testid="chat-title-input"
                        aria-label="编辑会话标题"
                        value={titleDraft}
                        disabled={updateThreadTitle.isPending}
                        autoFocus
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void saveTitleEdit();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelTitleEdit();
                          }
                        }}
                        onBlur={() => void saveTitleEdit()}
                      />
                    ) : (
                      <button
                        type="button"
                        className="chat-main-title-edit"
                        data-testid="chat-title-edit"
                        title="点击编辑会话标题"
                        onClick={startTitleEdit}
                      >
                        {selectedThread.title}
                      </button>
                    )}
                  </h2>
                  <p className="chat-main-sub">
                    {selectedAgent?.name ?? agentName(selectedThread.agentId)}
                    {selectedAgent?.runtime ? ` · ${selectedAgent.runtime}` : ''}
                    {selectedAgent?.model ? ` · ${selectedAgent.model}` : ''}
                    {liveRun ? (
                      <span className="chat-live-pill" data-testid="chat-live-pill">
                        {liveRun.status === 'queued' ? '排队中' : '思考中'}
                      </span>
                    ) : null}
                  </p>
                  <div className="chat-main-project-row" data-testid="chat-project-row">
                    <label className="chat-project-field">
                      <span className="chat-project-label">项目</span>
                      <Select
                        className="chat-project-select"
                        value={selectedThread.projectId ?? ''}
                        aria-label="会话绑定项目"
                        data-testid="chat-project-select"
                        disabled={updateThreadProject.isPending}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateThreadProject.mutate({
                            id: selectedThread.id,
                            projectId: v ? v : null,
                          });
                        }}
                      >
                        <option value="">无项目（隔离执行）</option>
                        {projects.map((p) => {
                          const hint = p.localPath
                            ? p.localPathExists
                              ? ' · 已绑目录'
                              : ' · 路径无效'
                            : ' · 未绑目录';
                          return (
                            <option key={p.id} value={p.id}>
                              {p.title}
                              {hint}
                            </option>
                          );
                        })}
                      </Select>
                    </label>
                    {execContext ? (
                      <p
                        className="chat-main-cwd"
                        data-testid="chat-exec-context"
                        data-cwd-mode={execContext.mode}
                        title={execContext.path ?? undefined}
                      >
                        <span
                          className="chat-cwd-mode"
                          data-testid="chat-cwd-mode"
                        >
                          {execContext.modeLabel}
                        </span>
                        {execContext.path ? (
                          <>
                            {' · '}
                            <span
                              className="chat-cwd-path"
                              data-testid="chat-cwd-path"
                            >
                              {truncatePath(execContext.path)}
                            </span>
                          </>
                        ) : null}
                        {execContext.mode === 'none' && selectedThread.projectId ? (
                          <span className="chat-cwd-warn" data-testid="chat-cwd-invalid">
                            {' '}
                            · 路径无效，run 会失败
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className="chat-messages-wrap">
                <div
                  className="chat-messages"
                  data-testid="chat-messages"
                  ref={messagesRef}
                  onScroll={handleMessagesScroll}
                >
                  {messagesLoading ? (
                    <div
                      className="chat-messages-loading"
                      data-testid="chat-messages-loading"
                      aria-busy="true"
                    >
                      <Skeleton variant="rectangular" height={56} className="mb-3" />
                      <Skeleton variant="rectangular" height={56} className="mb-3" />
                      <Skeleton variant="rectangular" height={40} width="70%" />
                    </div>
                  ) : messagesError ? (
                    <div
                      className="chat-messages-error"
                      data-testid="chat-messages-error"
                    >
                      <ErrorState
                        title="加载消息失败"
                        description={
                          messagesErr instanceof Error
                            ? messagesErr.message
                            : '未知错误'
                        }
                        onRetry={() => void refetchMessages()}
                      />
                    </div>
                  ) : messages.length === 0 && !liveRun ? (
                    <EmptyState
                      className="chat-messages-empty"
                      title="还没有消息"
                      description="打个招呼吧，Enter 发送。"
                    />
                  ) : (
                    messages.map((m) => {
                      const isUser = m.role === 'user';
                      return (
                        <div
                          key={m.id}
                          className={`chat-row chat-row--${isUser ? 'user' : 'assistant'}`}
                          data-testid="chat-bubble"
                          data-role={m.role}
                        >
                          {!isUser ? (
                            <span className="chat-avatar chat-avatar--sm" aria-hidden>
                              {initials(agentName(selectedThread.agentId))}
                            </span>
                          ) : null}
                          <div
                            className={`chat-bubble chat-bubble--${isUser ? 'user' : 'assistant'}`}
                          >
                            {isUser ? (
                              <div className="chat-bubble-plain">{m.body}</div>
                            ) : (
                              <div className="chat-bubble-md">
                                <MarkdownBody source={m.body} />
                              </div>
                            )}
                            <div className="chat-bubble-time">
                              {relativeTime(m.createdAt)}
                              {m.runId ? (
                                <>
                                  {' · '}
                                  <Link
                                    href={`/runs/${encodeURIComponent(m.runId)}`}
                                    className="chat-run-link"
                                    data-testid="chat-msg-run-link"
                                  >
                                    运行 {shortId(m.runId)}
                                  </Link>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {liveRun ? (
                    <ThinkingRow
                      run={liveRun}
                      agentLabel={agentName(selectedThread.agentId)}
                      progress={liveProgress}
                      toolName={liveTool}
                      partialText={livePartial}
                    />
                  ) : null}

                  {!liveRun && lastFailedRun && failure ? (
                    <div
                      className="chat-row chat-row--assistant"
                      data-testid="chat-fail-row"
                    >
                      <span className="chat-avatar chat-avatar--sm" aria-hidden>
                        {initials(agentName(selectedThread.agentId))}
                      </span>
                      <div className="chat-fail-card">
                        <strong>{failure.title}</strong>
                        <p className="chat-fail-hint">{failure.hint}</p>
                        {lastFailedRun.error ? (
                          <pre className="chat-fail-error">{lastFailedRun.error}</pre>
                        ) : null}
                        <div className="chat-fail-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            data-testid="chat-fail-resend"
                            disabled={
                              !lastUserBody ||
                              postMessage.isPending ||
                              Boolean(liveRun)
                            }
                            onClick={() => void handleResendLast()}
                            title={
                              lastUserBody
                                ? '用上一条用户消息再开一轮'
                                : '没有可重发的用户消息'
                            }
                          >
                            {postMessage.isPending ? '重发中…' : '重发上一条'}
                          </button>
                          <Link
                            href={`/runs/${encodeURIComponent(lastFailedRun.id)}`}
                            className="btn btn-secondary btn-sm"
                            data-testid="chat-fail-open-run"
                          >
                            查看运行详情
                          </Link>
                          <Link
                            href={`/runs?run=${encodeURIComponent(lastFailedRun.id)}&status=failed`}
                            className="btn btn-ghost btn-sm"
                          >
                            运行列表
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div ref={bottomRef} />
                </div>
                {showNewMessagesBtn ? (
                  <button
                    type="button"
                    className="chat-new-messages-btn"
                    data-testid="chat-new-messages-btn"
                    onClick={() => {
                      setStickToBottom(true);
                      setShowNewMessagesBtn(false);
                      scrollToBottom('smooth');
                    }}
                  >
                    ↓ 新消息
                  </button>
                ) : null}
              </div>

              <div className="chat-composer" data-testid="chat-composer">
                <div className="chat-composer-box">
                  <textarea
                    className="chat-composer-input"
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      liveRun
                        ? '智能体正在处理上一消息…'
                        : `给 ${agentName(selectedThread.agentId)} 发消息…`
                    }
                    data-testid="chat-input"
                    disabled={Boolean(liveRun) || postMessage.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  {liveRun ? (
                    <button
                      type="button"
                      className="btn-stop chat-composer-stop"
                      data-testid="chat-cancel-run"
                      disabled={cancelRun.isPending}
                      title="停止当前聊天运行"
                      aria-label="停止"
                      onClick={() => {
                        void (async () => {
                          const ok = await confirmDialog({
                            title: '停止当前回复？',
                            description: '可稍后重发上一条。',
                            confirmLabel: '停止',
                            variant: 'danger',
                          });
                          if (!ok) return;
                          cancelRun.mutate(liveRun.id);
                        })();
                      }}
                    >
                      {cancelRun.isPending ? '…' : '停止'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chat-composer-send"
                      data-testid="chat-send"
                      disabled={!draft.trim() || postMessage.isPending}
                      onClick={() => void handleSend()}
                      title="发送"
                      aria-label="发送"
                    >
                      {postMessage.isPending ? '…' : '↑'}
                    </button>
                  )}
                </div>
                <p className="chat-composer-hint">
                  {liveRun
                    ? liveRun.status === 'queued'
                      ? '消息已派发，等待 worker 领取… · 可停止'
                      : '智能体执行中 · 可停止后重发'
                    : 'Enter 发送 · Shift+Enter 换行'}
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
    </ErrorBoundary>
  );
}

function ThinkingRow({
  run,
  agentLabel,
  progress,
  toolName,
  partialText,
}: {
  run: AgentRun;
  agentLabel: string;
  progress?: string;
  toolName?: string;
  partialText?: string;
}) {
  const statusLabel =
    run.status === 'queued'
      ? '排队中'
      : toolName
        ? `使用工具 · ${toolName}`
        : partialText
          ? '正在回复'
          : '正在思考';
  const hasLive = Boolean(progress || toolName || partialText);
  return (
    <div
      className="chat-row chat-row--assistant"
      data-testid="chat-thinking-row"
      data-run-status={run.status}
      data-run-id={run.id}
      data-has-live={hasLive ? '1' : '0'}
    >
      <span className="chat-avatar chat-avatar--sm" aria-hidden>
        {initials(agentLabel)}
      </span>
      <div className="chat-thinking-card">
        <div className="chat-thinking-head">
          <span className="chat-thinking-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="chat-thinking-label" data-testid="chat-thinking-label">
            {statusLabel}
          </span>
          {toolName ? (
            <span className="chat-thinking-tool" data-testid="chat-thinking-tool">
              {toolName}
            </span>
          ) : null}
          <Link
            href={`/runs/${encodeURIComponent(run.id)}`}
            className="chat-run-link"
            data-testid="chat-thinking-run-link"
          >
            运行 {shortId(run.id)}
          </Link>
        </div>
        {run.status === 'running' ? (
          <div className="chat-thinking-bar" aria-hidden>
            <span className="chat-thinking-bar-fill" />
          </div>
        ) : null}
        <p
          className={`chat-thinking-progress${progress || toolName ? '' : ' is-idle'}`}
          data-testid="chat-thinking-progress"
        >
          {progress
            ? progress
            : toolName
              ? `正在调用 ${toolName}…`
              : run.status === 'queued'
                ? '已入队，等待本机 CLI 执行…'
                : '执行中，等待进度推送（部分 runtime 结束才有输出）…'}
        </p>
        {partialText ? (
          <div
            className="chat-thinking-partial"
            data-testid="chat-thinking-partial"
          >
            <MarkdownBody source={partialText} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
