'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { classifyRunFailure, type AgentRun } from '@ma/shared';
import {
  useAgents,
  useArchiveChatThread,
  useCancelRun,
  useChatExecContext,
  useChatMessages,
  useChatThreads,
  useCreateChatThread,
  usePinChatThread,
  usePostChatMessage,
  useProjects,
  useRunMessages,
  useUpdateChatThreadProject,
  useWorkspaceRuns,
} from '@/lib/api';
import { useRunProgressStore } from '@/lib/ws';
import { MarkdownBody } from './MarkdownBody';

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
  const { data: threads = [], isLoading: threadsLoading } = useChatThreads({
    archived: showArchived,
  });
  const pinThread = usePinChatThread();
  const archiveThread = useArchiveChatThread();
  const updateThreadProject = useUpdateChatThreadProject();
  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(
    threadId || undefined,
  );
  const { data: execContext } = useChatExecContext(threadId || undefined);
  const createThread = useCreateChatThread();
  const postMessage = usePostChatMessage(threadId || undefined);
  const cancelRun = useCancelRun();

  const { data: threadRuns = [] } = useWorkspaceRuns({
    chatThreadId: threadId || undefined,
    kind: 'chat',
    limit: 20,
    enabled: Boolean(threadId),
    // 在途时加快轮询，补 WS 丢包 / 页面未订阅
    refetchIntervalMs: 2500,
  });

  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const toolByRun = useRunProgressStore((s) => s.toolByRunId);
  const partialByRun = useRunProgressStore((s) => s.partialByRunId);

  const agentFromUrl = searchParams.get('agent') ?? '';
  const [agentId, setAgentId] = useState('');
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (agentFromUrl && agents.some((a) => a.id === agentFromUrl)) {
      setAgentId(agentFromUrl);
      return;
    }
    if (!agentId && agents[0]?.id) setAgentId(agents[0].id);
  }, [agents, agentId, agentFromUrl]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === threadId) ?? null,
    [threads, threadId],
  );

  const agentById = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a]));
    return m;
  }, [agents]);

  const agentName = (id: string) => agentById.get(id)?.name ?? id;

  const liveRun = useMemo(() => {
    return (
      threadRuns.find((r) => r.status === 'queued' || r.status === 'running') ?? null
    );
  }, [threadRuns]);

  const lastFailedRun = useMemo(() => {
    if (liveRun) return null;
    return (
      threadRuns.find((r) => r.status === 'failed' || r.status === 'cancelled') ?? null
    );
  }, [threadRuns, liveRun]);

  // D1：订阅 run-messages（WS 写入 cache；在途轮询补丢包）
  const { data: liveRunMessages = [] } = useRunMessages(liveRun?.id, {
    refetchIntervalMs: liveRun ? 2000 : false,
  });

  const derivedFromTrace = useMemo(() => {
    let tool: string | undefined;
    const assistantParts: string[] = [];
    for (const m of liveRunMessages) {
      if (m.kind === 'tool_start') {
        try {
          const j = JSON.parse(m.body) as { name?: string };
          if (j?.name?.trim()) tool = j.name.trim();
        } catch {
          if (m.body.trim()) tool = m.body.trim().slice(0, 80);
        }
      }
      if (m.kind === 'assistant' && m.body?.trim()) {
        assistantParts.push(m.body.trim());
      }
    }
    return {
      tool,
      partial: assistantParts.length ? assistantParts.join('\n\n') : undefined,
    };
  }, [liveRunMessages]);

  const liveProgress =
    liveRun && (liveRun.status === 'running' || liveRun.status === 'queued')
      ? progressByRun[liveRun.id]?.trim()
      : undefined;
  const liveTool =
    liveRun && liveRun.status === 'running'
      ? toolByRun[liveRun.id]?.trim() || derivedFromTrace.tool
      : undefined;
  const livePartial =
    liveRun && liveRun.status === 'running'
      ? partialByRun[liveRun.id]?.trim() || derivedFromTrace.partial
      : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [
    messages.length,
    threadId,
    liveRun?.id,
    liveProgress,
    liveTool,
    livePartial,
    lastFailedRun?.id,
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

  async function handleSend() {
    const body = draft.trim();
    if (!body || !threadId || liveRun) return;
    setDraft('');
    await postMessage.mutateAsync(body);
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
    await postMessage.mutateAsync(lastUserBody);
  }

  const selectedAgent = selectedThread
    ? agentById.get(selectedThread.agentId)
    : null;

  const failure = lastFailedRun
    ? lastFailedRun.status === 'cancelled' && !(lastFailedRun.error ?? '').trim()
      ? {
          code: 'generic' as const,
          title: '运行已取消',
          hint: '可点「重发上一条」用同一用户消息再开一轮。',
          settingsHref: null as string | null,
        }
      : classifyRunFailure(lastFailedRun.error)
    : null;

  return (
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
                <select
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
                </select>
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
              <p className="chat-rail-hint">加载会话…</p>
            ) : threads.length === 0 ? (
              <div className="chat-rail-empty">
                <p>{showArchived ? '没有已归档会话' : '还没有对话'}</p>
                <p className="chat-rail-hint">
                  {showArchived ? '归档的会话会出现在这里' : '点右上角 + 与智能体开聊'}
                </p>
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
              <div className="chat-empty-card">
                <div className="chat-empty-icon" aria-hidden>
                  ✦
                </div>
                <h2>和你的智能体对话</h2>
                <p data-testid="chat-empty-copy">
                  一对一聊天：默认在隔离目录跑 CLI。会话头可绑项目本机目录，下一句即进真仓。
                  从左侧选会话，或点下方新建对话。
                </p>
                <button
                  type="button"
                  className="chat-empty-cta"
                  onClick={() => setPickerOpen(true)}
                  disabled={!agents.length}
                >
                  新对话
                </button>
              </div>
            </div>
          ) : (
            <>
              <header className="chat-main-head" data-testid="chat-main-head">
                <div className="chat-main-head-text">
                  <h2 className="chat-main-title">{selectedThread.title}</h2>
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
                      <select
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
                      </select>
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

              <div className="chat-messages" data-testid="chat-messages">
                {messagesLoading ? (
                  <p className="chat-rail-hint">加载消息…</p>
                ) : messages.length === 0 && !liveRun ? (
                  <p className="chat-rail-hint chat-messages-empty">
                    还没有消息，打个招呼吧。
                  </p>
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
                        if (!window.confirm('停止当前回复？可稍后重发上一条。')) return;
                        cancelRun.mutate(liveRun.id);
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
