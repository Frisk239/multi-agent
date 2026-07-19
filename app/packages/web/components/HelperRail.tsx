'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAgents,
  useAgentReadiness,
  useChatMessages,
  useChatThreads,
  useCreateChatThread,
} from '@/lib/api';
import { Icon } from './Icon';

const API = 'http://localhost:3001/api';

const STORAGE_OPEN = 'ma-helper-open';
const STORAGE_AGENT = 'ma-helper-agent-id';
const STORAGE_THREAD = 'ma-helper-thread-id';

/** Multica starter_prompts（zh） */
const STARTER_PROMPTS = [
  { id: 'list_open', label: '📋 按优先级列出我未完成的任务' },
  { id: 'summarize_today', label: '📝 总结一下我今天做了什么' },
  { id: 'plan_next', label: '💡 规划接下来该做什么' },
] as const;

function readStored(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * G10 helper-rail：对标 Multica FloatingChat
 * - FAB「问助手」+ 右下角浮窗
 * - 复用 /api/chat（不自造 loop）
 * - /chat 全页时隐藏，避免双开
 */
export function HelperRail() {
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data: agents = [] } = useAgents();
  const { data: threads = [] } = useChatThreads();
  const createThread = useCreateChatThread();

  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [threadId, setThreadId] = useState('');
  const [draft, setDraft] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setOpen(readStored(STORAGE_OPEN) === '1');
    setAgentId(readStored(STORAGE_AGENT));
    setThreadId(readStored(STORAGE_THREAD));
    setHydrated(true);
  }, []);

  // 默认 agent：记忆 > 名称含 Helper > 第一个
  useEffect(() => {
    if (!agents.length) return;
    if (agentId && agents.some((a) => a.id === agentId)) return;
    const helper = agents.find((a) => /helper|助手/i.test(a.name));
    const next = helper?.id ?? agents[0]!.id;
    setAgentId(next);
    writeStored(STORAGE_AGENT, next);
  }, [agents, agentId]);

  // 若线程不属于当前 agent 或已删，清空
  useEffect(() => {
    if (!threadId || !threads.length) return;
    const t = threads.find((x) => x.id === threadId);
    if (!t || (agentId && t.agentId !== agentId)) {
      setThreadId('');
      writeStored(STORAGE_THREAD, '');
    }
  }, [threads, threadId, agentId]);

  const { data: messages = [], isFetching: msgsFetching } = useChatMessages(
    open && threadId ? threadId : undefined,
  );
  const { data: readiness } = useAgentReadiness(agentId || '');

  const agentName = useMemo(() => {
    return agents.find((a) => a.id === agentId)?.name ?? '助手';
  }, [agents, agentId]);

  const agentThreads = useMemo(
    () => threads.filter((t) => t.agentId === agentId),
    [threads, agentId],
  );

  const offlineish =
    readiness != null &&
    readiness.status !== 'ready' &&
    readiness.status !== 'busy';

  // /chat 全页不显示浮层（Multica floating-chat 同款）
  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    return null;
  }

  if (!hydrated) return null;

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      writeStored(STORAGE_OPEN, next ? '1' : '0');
      return next;
    });
  }

  function close() {
    setOpen(false);
    writeStored(STORAGE_OPEN, '0');
  }

  async function ensureThread(): Promise<string | null> {
    if (threadId) return threadId;
    if (!agentId) return null;
    const existing = agentThreads[0];
    if (existing) {
      setThreadId(existing.id);
      writeStored(STORAGE_THREAD, existing.id);
      return existing.id;
    }
    const t = await createThread.mutateAsync({
      agentId,
      title: `与 ${agentName} 的对话`,
    });
    setThreadId(t.id);
    writeStored(STORAGE_THREAD, t.id);
    return t.id;
  }

  async function sendBody(text: string) {
    const body = text.trim();
    if (!body || !agentId) return;
    setSending(true);
    try {
      const tid = await ensureThread();
      if (!tid) throw new Error('无会话');
      const res = await fetch(
        `${API}/chat/threads/${encodeURIComponent(tid)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setThreadId(tid);
      writeStored(STORAGE_THREAD, tid);
      await qc.invalidateQueries({ queryKey: ['chat-messages', tid] });
      await qc.invalidateQueries({ queryKey: ['chat-threads'] });
      await qc.invalidateQueries({ queryKey: ['runs-active-count'] });
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      await sendBody(body);
    } catch {
      setDraft(body);
    }
  }

  async function handleStarter(label: string) {
    // 去掉 emoji 前缀，保留中文问句
    const text = label.replace(/^[^\u4e00-\u9fffA-Za-z]+/, '').trim() || label;
    setDraft('');
    try {
      await sendBody(text);
    } catch {
      setDraft(text);
    }
  }

  async function handleNewChat() {
    if (!agentId) return;
    const t = await createThread.mutateAsync({
      agentId,
      title: `与 ${agentName} 的对话`,
    });
    setThreadId(t.id);
    writeStored(STORAGE_THREAD, t.id);
    setDraft('');
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="helper-fab"
          data-testid="helper-fab"
          aria-label="问助手"
          onClick={toggleOpen}
        >
          <Icon name="help" size={18} />
          <span>问助手</span>
        </button>
      ) : null}

      {open ? (
        <div className="helper-rail" data-testid="helper-rail" role="dialog" aria-label="本地助手">
          <div className="helper-rail-head">
            <div className="helper-rail-title">
              <Icon name="bot" size={16} />
              <span data-testid="helper-agent-name">{agentName}</span>
            </div>
            <div className="helper-rail-actions">
              <Link
                href={threadId ? `/chat?thread=${encodeURIComponent(threadId)}` : '/chat'}
                className="btn-ghost btn-sm"
                data-testid="helper-open-chat"
                title="在聊天页打开"
              >
                全屏
              </Link>
              <button
                type="button"
                className="btn-ghost btn-sm"
                data-testid="helper-new-chat"
                disabled={createThread.isPending || !agentId}
                onClick={() => void handleNewChat()}
              >
                新对话
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                data-testid="helper-close"
                aria-label="关闭助手"
                onClick={close}
              >
                收起
              </button>
            </div>
          </div>

          <div className="helper-rail-agent-row">
            <label className="helper-agent-label text-dim text-sm">
              绑定智能体
              <select
                className="input helper-agent-select"
                value={agentId}
                data-testid="helper-agent-select"
                onChange={(e) => {
                  const id = e.target.value;
                  setAgentId(id);
                  writeStored(STORAGE_AGENT, id);
                  setThreadId('');
                  writeStored(STORAGE_THREAD, '');
                }}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.runtime}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {offlineish ? (
            <div className="helper-offline-banner" data-testid="helper-offline-banner" role="status">
              助手当前 <strong>{readiness?.status}</strong>
              {readiness?.detail ? ` · ${readiness.detail}` : ''}
              。消息仍会排队，环境就绪后由本机 CLI 执行。
              <Link href="/settings" className="table-link">
                环境诊断
              </Link>
            </div>
          ) : null}

          <div className="helper-rail-body" data-testid="helper-messages">
            {messages.length === 0 ? (
              <div className="helper-empty" data-testid="helper-empty">
                <p className="helper-empty-title">
                  {agentName ? `你好，我是 ${agentName}` : '本地助手'}
                </p>
                <p className="text-dim text-sm">试试问：</p>
                <div className="helper-starters" data-testid="helper-starters">
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="helper-starter-chip"
                      data-testid={`helper-starter-${p.id}`}
                      disabled={!agentId || createThread.isPending || sending}
                      onClick={() => void handleStarter(p.label)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="helper-msg-list">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`helper-msg helper-msg--${m.role}`}
                    data-testid="helper-msg"
                    data-role={m.role}
                  >
                    <div className="helper-msg-role text-dim text-sm">{m.role}</div>
                    <pre className="helper-msg-body">{m.body}</pre>
                  </li>
                ))}
                {msgsFetching ? (
                  <li className="text-dim text-sm" data-testid="helper-fetching">
                    同步中…
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          <div className="helper-rail-composer" data-testid="helper-composer">
            <textarea
              className="helper-input"
              rows={2}
              placeholder={agentId ? `问 ${agentName}…` : '请先选择智能体'}
              value={draft}
              data-testid="helper-input"
              disabled={!agentId || sending || createThread.isPending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <button
              type="button"
              className="btn-primary btn-sm"
              data-testid="helper-send"
              disabled={
                !draft.trim() || !agentId || sending || createThread.isPending
              }
              onClick={() => void handleSend()}
            >
              {sending || createThread.isPending ? '发送中…' : '发送'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
