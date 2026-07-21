'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { classifyRunFailure, type AgentRun } from '@ma/shared';
import {
  useAgents,
  useChatMessages,
  useChatThreads,
  useCreateChatThread,
  usePostChatMessage,
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

/**
 * 聊天页：对齐 Multica 会话列表 + 主区。
 * 关键修复：WS 终态刷 messages；展示「思考中」进度与最近失败原因（避免静默卡死感）。
 */
export function ChatPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const threadId = searchParams.get('thread') ?? '';

  const { data: agents = [] } = useAgents();
  const { data: threads = [], isLoading: threadsLoading } = useChatThreads();
  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(
    threadId || undefined,
  );
  const createThread = useCreateChatThread();
  const postMessage = usePostChatMessage(threadId || undefined);

  const { data: threadRuns = [] } = useWorkspaceRuns({
    chatThreadId: threadId || undefined,
    kind: 'chat',
    limit: 20,
    enabled: Boolean(threadId),
    // 在途时加快轮询，补 WS 丢包 / 页面未订阅
    refetchIntervalMs: 2500,
  });

  const progressByRun = useRunProgressStore((s) => s.byRunId);

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

  const liveProgress =
    liveRun && liveRun.status === 'running'
      ? progressByRun[liveRun.id]?.trim()
      : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, threadId, liveRun?.id, liveProgress, lastFailedRun?.id]);

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

  const selectedAgent = selectedThread
    ? agentById.get(selectedThread.agentId)
    : null;

  const failure = lastFailedRun
    ? classifyRunFailure(lastFailedRun.error)
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
            {threadsLoading ? (
              <p className="chat-rail-hint">加载会话…</p>
            ) : threads.length === 0 ? (
              <div className="chat-rail-empty">
                <p>还没有对话</p>
                <p className="chat-rail-hint">点右上角 + 与智能体开聊</p>
              </div>
            ) : (
              <ul className="chat-threads">
                {threads.map((t) => {
                  const ag = agentById.get(t.agentId);
                  const name = ag?.name ?? t.agentId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`chat-thread-item${t.id === threadId ? ' is-active' : ''}`}
                        data-testid="chat-thread-item"
                        data-thread-id={t.id}
                        onClick={() => selectThread(t.id)}
                      >
                        <span className="chat-avatar" aria-hidden>
                          {initials(name)}
                        </span>
                        <span className="chat-thread-text">
                          <span className="chat-thread-title">{t.title}</span>
                          <span className="chat-thread-preview">
                            {t.lastMessagePreview?.trim() || name}
                          </span>
                        </span>
                      </button>
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
                <p>它们了解工作区里的 issue 与上下文。选一个会话，或新建对话。</p>
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
                  <button
                    type="button"
                    className="chat-composer-send"
                    data-testid="chat-send"
                    disabled={
                      !draft.trim() || postMessage.isPending || Boolean(liveRun)
                    }
                    onClick={() => void handleSend()}
                    title={liveRun ? '等待当前回复完成' : '发送'}
                    aria-label="发送"
                  >
                    {postMessage.isPending ? '…' : '↑'}
                  </button>
                </div>
                <p className="chat-composer-hint">
                  {liveRun
                    ? liveRun.status === 'queued'
                      ? '消息已派发，等待 worker 领取…'
                      : '智能体执行中 · 有进度会显示在上方'
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
}: {
  run: AgentRun;
  agentLabel: string;
  progress?: string;
}) {
  const statusLabel = run.status === 'queued' ? '排队中' : '正在思考';
  return (
    <div
      className="chat-row chat-row--assistant"
      data-testid="chat-thinking-row"
      data-run-status={run.status}
      data-run-id={run.id}
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
          <span className="chat-thinking-label">{statusLabel}</span>
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
          className={`chat-thinking-progress${progress ? '' : ' is-idle'}`}
          data-testid="chat-thinking-progress"
        >
          {progress
            ? progress
            : run.status === 'queued'
              ? '已入队，等待本机 CLI 执行…'
              : '执行中，等待进度推送（部分 runtime 结束才有输出）…'}
        </p>
      </div>
    </div>
  );
}
