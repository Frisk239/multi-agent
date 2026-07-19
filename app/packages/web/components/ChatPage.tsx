'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useAgents,
  useChatMessages,
  useChatThreads,
  useCreateChatThread,
  usePostChatMessage,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

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

  const [agentId, setAgentId] = useState('');
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!agentId && agents[0]?.id) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === threadId) ?? null,
    [threads, threadId],
  );
  const agentName = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a.name]));
    return (id: string) => m.get(id) ?? id;
  }, [agents]);

  function selectThread(id: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (id) sp.set('thread', id);
    else sp.delete('thread');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function handleCreate() {
    if (!agentId) return;
    const t = await createThread.mutateAsync({ agentId });
    selectThread(t.id);
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body || !threadId) return;
    setDraft('');
    await postMessage.mutateAsync(body);
  }

  return (
    <div className="page-container chat-page" data-testid="chat-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Icon name="inbox" size={18} /> 聊天
            <span className="count">{threads.length}</span>
          </div>
          <div className="page-desc">
            对齐 Multica「聊天」：与指定 Agent 一对一会话；消息会触发本机 CLI run
          </div>
        </div>
        <div className="page-actions chat-new-row">
          <select
            className="input"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            data-testid="chat-agent-select"
            aria-label="选择智能体"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.runtime}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary btn-sm"
            data-testid="chat-new-thread"
            disabled={!agentId || createThread.isPending}
            onClick={() => void handleCreate()}
          >
            {createThread.isPending ? '创建中…' : '新建对话'}
          </button>
        </div>
      </div>

      <div className="chat-split" data-testid="chat-split">
        <div className="chat-thread-list" data-testid="chat-thread-list">
          {threadsLoading ? (
            <p className="text-dim text-sm" style={{ padding: 12 }}>
              加载会话…
            </p>
          ) : threads.length === 0 ? (
            <EmptyState
              title="还没有对话"
              description="选择智能体后点「新建对话」，再发送消息。"
            />
          ) : (
            <ul className="chat-threads">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`chat-thread-item${t.id === threadId ? ' is-active' : ''}`}
                    data-testid="chat-thread-item"
                    data-thread-id={t.id}
                    onClick={() => selectThread(t.id)}
                  >
                    <span className="chat-thread-title">{t.title}</span>
                    <span className="chat-thread-meta text-dim text-sm">
                      {agentName(t.agentId)}
                      {t.lastMessagePreview ? ` · ${t.lastMessagePreview}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="chat-main" data-testid="chat-main">
          {!threadId || !selectedThread ? (
            <div className="chat-empty" data-testid="chat-empty">
              <p>选择一个对话，或点「新建对话」</p>
            </div>
          ) : (
            <>
              <div className="chat-main-head" data-testid="chat-main-head">
                <strong>{selectedThread.title}</strong>
                <span className="text-dim text-sm">
                  {agentName(selectedThread.agentId)}
                </span>
              </div>
              <div className="chat-messages" data-testid="chat-messages">
                {messagesLoading ? (
                  <p className="text-dim text-sm">加载消息…</p>
                ) : messages.length === 0 ? (
                  <p className="text-dim text-sm">还没有消息，说点什么吧。</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`chat-bubble chat-bubble--${m.role}`}
                      data-testid="chat-bubble"
                      data-role={m.role}
                    >
                      <div className="chat-bubble-role">{m.role}</div>
                      <pre className="chat-bubble-body">{m.body}</pre>
                    </div>
                  ))
                )}
              </div>
              <div className="chat-composer" data-testid="chat-composer">
                <textarea
                  className="input"
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="给智能体发消息…"
                  data-testid="chat-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="chat-send"
                  disabled={!draft.trim() || postMessage.isPending}
                  onClick={() => void handleSend()}
                >
                  {postMessage.isPending ? '发送中…' : '发送'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
