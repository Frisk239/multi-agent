'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useAgents,
  useChatMessages,
  useChatThreads,
  useCreateChatThread,
  usePostChatMessage,
} from '@/lib/api';
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, threadId]);

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
    if (!body || !threadId) return;
    setDraft('');
    await postMessage.mutateAsync(body);
  }

  const selectedAgent = selectedThread
    ? agentById.get(selectedThread.agentId)
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
                  </p>
                </div>
              </header>

              <div className="chat-messages" data-testid="chat-messages">
                {messagesLoading ? (
                  <p className="chat-rail-hint">加载消息…</p>
                ) : messages.length === 0 ? (
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
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="chat-composer" data-testid="chat-composer">
                <div className="chat-composer-box">
                  <textarea
                    className="chat-composer-input"
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`给 ${agentName(selectedThread.agentId)} 发消息…`}
                    data-testid="chat-input"
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
                    disabled={!draft.trim() || postMessage.isPending}
                    onClick={() => void handleSend()}
                    title="发送"
                    aria-label="发送"
                  >
                    {postMessage.isPending ? '…' : '↑'}
                  </button>
                </div>
                <p className="chat-composer-hint">Enter 发送 · Shift+Enter 换行</p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
