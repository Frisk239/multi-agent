'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import type { AgentPulseStatus } from '@ma/shared';
import { useAgents, useSquads, useCreateComment } from '@/lib/api';
import { draftKey, usePersistentDraft } from '@/lib/draft-storage';
import {
  parseMentionChips,
  removeMentionFromBody,
} from '@/lib/mention-chips';
import { Icon } from './Icon';
import { AgentStatusBadge } from './AgentStatusBadge';
import { MarkdownBody } from './MarkdownBody';
import {
  appendAttachmentMarkdown,
  validateImageDataUrl,
} from '@/lib/comment-attachments';

export function CommentComposer({ issueId }: { issueId: string }) {
  const {
    value: body,
    setValue: setBody,
    clear: clearDraftBody,
  } = usePersistentDraft(issueId ? draftKey.comment(issueId) : null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // F1 · paste image → markdown data URL embed (local, no cloud)
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const create = useCreateComment(issueId);

  // 整理可选的 Agent 和 Squad 槽位
  const roster = useMemo(
    () => [
      ...agents.map((a) => ({
        kind: 'agent' as const,
        id: a.id,
        name: a.name,
        category: a.category,
        liveStatus: a.liveStatus,
        activeRunCount: a.activeRunCount,
      })),
      ...squads.map((s) => ({
        kind: 'squad' as const,
        id: s.id,
        name: s.name,
        tag: '小队',
        liveStatus: undefined,
        activeRunCount: undefined,
      })),
    ],
    [agents, squads]
  );

  const filtered = useMemo(() => {
    if (mentionQ === null) return [];
    const q = mentionQ.toLowerCase();
    return roster.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQ, roster]);

  // 重置选中项索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  // Sticky mention chips（从 body 解析，删 chip 同步 markdown）
  const mentionChips = useMemo(() => parseMentionChips(body), [body]);

  // 计算当前输入内容中将要触发唤醒的 Agent / Squad（Multica 风格唤醒预览）
  const liveTriggers = useMemo(() => {
    if (!body.trim()) return [];
    const triggered: { kind: 'agent' | 'squad'; name: string; status?: AgentPulseStatus; detail?: string }[] = [];
    const seen = new Set<string>();

    for (const r of roster) {
      const isMentioned =
        body.includes(`mention://${r.kind}/${r.id}`) ||
        body.includes(`@${r.name}`);
      if (isMentioned && !seen.has(`${r.kind}-${r.id}`)) {
        seen.add(`${r.kind}-${r.id}`);
        triggered.push({
          kind: r.kind,
          name: r.name,
          status: r.liveStatus,
          detail: r.kind === 'squad' ? '小队协作派发' : r.liveStatus === 'working' ? '当前工作中 (将并列/排队)' : '自动唤醒开工',
        });
      }
    }
    return triggered;
  }, [body, roster]);

  function removeChip(id: string) {
    setBody((prev) => removeMentionFromBody(prev, id));
    setMentionQ(null);
  }

  function onChange(v: string) {
    setBody(v);
    const el = taRef.current;
    const pos = el?.selectionStart ?? v.length;
    const before = v.slice(0, pos);
    const m = before.match(/@([^\s@]*)$/);
    setMentionQ(m ? m[1] : null);
  }

  function insertMention(kind: 'agent' | 'squad', id: string, name: string) {
    const el = taRef.current;
    const pos = el?.selectionStart ?? body.length;
    const before = body.slice(0, pos);
    const after = body.slice(pos);
    const replaced = before.replace(/@([^\s@]*)$/, `[@${name}](mention://${kind}/${id}) `);
    setBody(replaced + after);
    setMentionQ(null);
    if (el) {
      setTimeout(() => {
        el.focus();
        const nextPos = replaced.length;
        el.setSelectionRange(nextPos, nextPos);
      }, 0);
    }
  }

  function applyFormatting(prefix: string, suffix: string = prefix, placeholder: string = '文本') {
    const el = taRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const replacement = `${prefix}${selected}${suffix}`;
    const nextBody = body.slice(0, start) + replacement + body.slice(end);
    setBody(nextBody);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 快捷提交 Ctrl+Enter / Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }

    // Mention 弹窗键盘导航
    if (filtered.length > 0 && mentionQ !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const target = filtered[selectedIndex];
        if (target) {
          insertMention(target.kind, target.id, target.name);
        }
      } else if (e.key === 'Escape') {
        setMentionQ(null);
      }
    }
  }

  function submit() {
    const t = body.trim();
    if (!t || create.isPending) return;
    create.mutate(
      { body: t },
      {
        onSuccess: () => {
          clearDraftBody();
          setMode('edit');
          setAttachError(null);
        },
      }
    );
  }

  /** F1 · paste image → markdown data URL embed (local, no cloud). */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const v = validateImageDataUrl(dataUrl, { fileName: file.name || 'paste.png' });
        if (!v.ok) {
          setAttachError(v.error);
          return;
        }
        setAttachError(null);
        setBody((prev) => appendAttachmentMarkdown(prev, v.markdown));
      };
      reader.readAsDataURL(file);
      return;
    }
  }

  return (
    <div className="composer-card" data-testid="comment-composer">
      {/* 顶栏 Toolbar: 模式切换 + Markdown 工具 */}
      <div className="composer-toolbar">
        <div className="composer-tabs">
          <button
            type="button"
            className={`composer-tab ${mode === 'edit' ? 'is-active' : ''}`}
            onClick={() => setMode('edit')}
            data-testid="composer-tab-edit"
          >
            编辑
          </button>
          <button
            type="button"
            className={`composer-tab ${mode === 'preview' ? 'is-active' : ''}`}
            onClick={() => setMode('preview')}
            data-testid="composer-tab-preview"
          >
            预览
          </button>
        </div>

        {mode === 'edit' && (
          <div className="composer-actions-group">
            <button
              type="button"
              className="composer-tool-btn"
              title="加粗 (Bold)"
              onClick={() => applyFormatting('**', '**', '加粗')}
              data-testid="composer-tool-bold"
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className="composer-tool-btn"
              title="斜体 (Italic)"
              onClick={() => applyFormatting('*', '*', '斜体')}
              data-testid="composer-tool-italic"
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className="composer-tool-btn"
              title="代码 (Code)"
              onClick={() => applyFormatting('`', '`', '代码')}
              data-testid="composer-tool-code"
            >
              <code>&lt;&gt;</code>
            </button>
            <button
              type="button"
              className="composer-tool-btn composer-tool-mention"
              title="插入 @Mention"
              onClick={() => {
                const el = taRef.current;
                if (!el) return;
                const pos = el.selectionStart;
                setBody(body.slice(0, pos) + '@' + body.slice(pos));
                setMentionQ('');
                setTimeout(() => el.focus(), 0);
              }}
              data-testid="composer-tool-mention"
            >
              @提及
            </button>
          </div>
        )}
      </div>

      {/* 主输入区 vs 预览区 */}
      <div className="composer-body-wrap">
        {mode === 'edit' ? (
          <div className="composer-input-area">
            <textarea
              ref={taRef}
              className="composer-input"
              placeholder="留下评论… 输入 @ 提及 agent/小队；可粘贴图片；Ctrl+Enter 发送"
              value={body}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={4}
              data-testid="comment-composer-textarea"
            />
            {attachError ? (
              <p className="text-sm" data-testid="comment-attach-error" role="alert">
                {attachError}
              </p>
            ) : null}

            {/* Mention @ 自动补全菜单 */}
            {filtered.length > 0 && mentionQ !== null && (
              <ul className="mention-menu-popover" data-testid="mention-autocomplete-menu">
                {filtered.map((r, idx) => (
                  <li
                    key={`${r.kind}-${r.id}`}
                    className={`mention-menu-item ${idx === selectedIndex ? 'is-selected' : ''}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <button
                      type="button"
                      className="mention-item-btn"
                      onClick={() => insertMention(r.kind, r.id, r.name)}
                    >
                      <span className="mention-item-icon">
                        <Icon name={r.kind === 'agent' ? 'agent' : 'squad'} size={14} />
                      </span>
                      <span className="mention-item-name">@{r.name}</span>
                      {r.kind === 'agent' ? (
                        <AgentStatusBadge status={r.liveStatus} size="sm" showLabel={true} />
                      ) : (
                        <span className="mention-item-tag">{r.tag}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Slice 54 · sticky mention chips（扫清 @ 了谁） */}
            {mentionChips.length > 0 && (
              <div
                className="composer-mention-chips"
                data-testid="composer-mention-chips"
                role="list"
                aria-label="Mention chips"
              >
                {mentionChips.map((chip) => {
                  const label = chip.label.startsWith('@')
                    ? chip.label
                    : `@${chip.label}`;
                  return (
                    <span
                      key={`${chip.kind}-${chip.id}`}
                      className="composer-mention-chip"
                      data-testid="composer-mention-chip"
                      data-mention-kind={chip.kind}
                      data-mention-id={chip.id}
                      role="listitem"
                      aria-label={`Mention ${chip.kind}: ${label}`}
                    >
                      <Icon
                        name={chip.kind === 'agent' ? 'agent' : 'squad'}
                        size={12}
                      />
                      <span className="composer-mention-chip-label">{label}</span>
                      <button
                        type="button"
                        className="composer-mention-chip-remove"
                        aria-label={`移除 ${label}`}
                        title={`移除 ${label}`}
                        data-testid="composer-mention-chip-remove"
                        onClick={() => removeChip(chip.id)}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="composer-preview-area" data-testid="comment-composer-preview">
            {body.trim() ? (
              <MarkdownBody source={body} />
            ) : (
              <span className="text-dim text-sm">暂无内容，请在“编辑”模式输入评论</span>
            )}
          </div>
        )}
      </div>

      {/* Multica 风格：智能体 Live 唤醒触发预览 Bar */}
      {liveTriggers.length > 0 && (
        <div className="composer-trigger-preview" data-testid="comment-trigger-preview">
          <div className="trigger-preview-header">
            <span className="trigger-icon">⚡ 唤醒预览</span>
            <span className="trigger-subtitle">发送评论后将自动触发以下派发:</span>
          </div>
          <div className="trigger-preview-items">
            {liveTriggers.map((t, idx) => (
              <div key={idx} className="trigger-preview-pill">
                <Icon name={t.kind === 'agent' ? 'agent' : 'squad'} size={12} />
                <span className="trigger-name">@{t.name}</span>
                {t.status ? <AgentStatusBadge status={t.status} size="sm" /> : null}
                <span className="trigger-detail">· {t.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底栏: 提示 + 发送按钮 */}
      <div className="composer-footer">
        <span className="text-dim text-xs">
          支持 Markdown 语法 · Ctrl+Enter 快捷发送
        </span>
        <div className="composer-footer-actions">
          {create.isError && <span className="error text-xs mr-2">发送失败</span>}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={create.isPending || !body.trim()}
            data-testid="comment-submit-btn"
          >
            {create.isPending ? '发送中…' : '发送评论'}
          </button>
        </div>
      </div>
    </div>
  );
}
