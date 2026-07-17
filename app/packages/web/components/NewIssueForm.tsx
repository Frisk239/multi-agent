'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CreateIssueInput, Priority } from '@ma/shared';
import { useAgents, useCreateIssue, useSquads } from '@/lib/api';
import { Icon } from './Icon';

// S12：内联表单升级——可指派 agent/squad；侧栏 /?new=1 触发展开
export function NewIssueForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('none');
  const [assigneeValue, setAssigneeValue] = useState('');
  const create = useCreateIssue();
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('new');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  function reset() {
    setTitle('');
    setPriority('none');
    setAssigneeValue('');
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    let assignee: CreateIssueInput['assignee'] = null;
    if (assigneeValue.startsWith('agent:')) {
      assignee = { type: 'agent', id: assigneeValue.slice('agent:'.length) };
    } else if (assigneeValue.startsWith('squad:')) {
      assignee = { type: 'squad', id: assigneeValue.slice('squad:'.length) };
    }

    create.mutate(
      { title: title.trim(), priority, assignee },
      {
        onSuccess: () => reset(),
      },
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn-new-issue" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        新建 Issue
      </button>
    );
  }

  return (
    <form className="new-issue-form" onSubmit={submit}>
      <input
        className="new-issue-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        autoFocus
      />
      <select
        className="new-issue-select"
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        aria-label="优先级"
      >
        <option value="none">无</option>
        <option value="low">低</option>
        <option value="medium">中</option>
        <option value="high">高</option>
        <option value="urgent">紧急</option>
      </select>
      <select
        className="new-issue-select new-issue-assignee"
        value={assigneeValue}
        onChange={(e) => setAssigneeValue(e.target.value)}
        aria-label="指派 agent 或小队"
      >
        <option value="">未指派</option>
        <optgroup label="智能体">
          {agents.map((a) => (
            <option key={a.id} value={`agent:${a.id}`}>
              {a.name} · {a.runtime}
            </option>
          ))}
        </optgroup>
        <optgroup label="小队">
          {squads.map((s) => (
            <option key={s.id} value={`squad:${s.id}`}>
              {s.name}
            </option>
          ))}
        </optgroup>
      </select>
      <button type="submit" className="btn-primary" disabled={create.isPending || !title.trim()}>
        提交
      </button>
      <button type="button" className="btn-ghost" onClick={reset}>
        取消
      </button>
    </form>
  );
}
