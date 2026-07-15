'use client';
import { useState } from 'react';
import type { Priority } from '@ma/shared';
import { useCreateIssue } from '@/lib/api';
import { Icon } from './Icon';

// spec D7：内联表单（非模态）
// D11：assignee 恒 null（seed agent/squad id 非 UUID，传了会被 POST Zod 校验 400 拒）
export function NewIssueForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('none');
  const create = useCreateIssue();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title, priority, assignee: null });
    setTitle('');
    setPriority('none');
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn-new-issue" onClick={() => setOpen(true)}>
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
      >
        <option value="none">无</option>
        <option value="low">低</option>
        <option value="medium">中</option>
        <option value="high">高</option>
        <option value="urgent">紧急</option>
      </select>
      <button type="submit" className="btn-primary" disabled={create.isPending}>
        提交
      </button>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        取消
      </button>
    </form>
  );
}
