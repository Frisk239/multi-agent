'use client';
import { useMemo, useState, useRef } from 'react';
import { useAgents, useSquads, useCreateComment } from '@/lib/api';

export function CommentComposer({ issueId }: { issueId: string }) {
  const [body, setBody] = useState('');
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const create = useCreateComment(issueId);

  const roster = useMemo(
    () => [
      ...agents.map((a) => ({ kind: 'agent' as const, id: a.id, name: a.name })),
      ...squads.map((s) => ({ kind: 'squad' as const, id: s.id, name: s.name, tag: '小队' })),
    ],
    [agents, squads],
  );

  const filtered = useMemo(() => {
    if (mentionQ === null) return [];
    const q = mentionQ.toLowerCase();
    return roster.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQ, roster]);

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
  }

  function submit() {
    const t = body.trim();
    if (!t || create.isPending) return;
    create.mutate(
      { body: t },
      {
        onSuccess: () => setBody(''),
      },
    );
  }

  return (
    <div className="composer">
      <textarea
        ref={taRef}
        className="composer-input"
        placeholder="留下评论… 输入 @ 提及 agent/小队"
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
      {filtered.length > 0 && (
        <ul className="mention-menu">
          {filtered.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <button type="button" onClick={() => insertMention(r.kind, r.id, r.name)}>
                @{r.name}
                {'tag' in r && r.tag ? ` · ${r.tag}` : ` · ${r.kind}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-primary" onClick={submit} disabled={create.isPending || !body.trim()}>
        发送
      </button>
      {create.isError && <span className="error">发送失败</span>}
    </div>
  );
}
