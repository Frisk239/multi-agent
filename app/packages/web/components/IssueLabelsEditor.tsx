'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Issue, IssueLabel } from '@ma/shared';
import { useCreateLabel, useDeleteLabel, useLabels, useSetIssueLabels } from '@/lib/api';

const PRESET_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#6b7280'];

export function IssueLabelsEditor({ issue }: { issue: Issue }) {
  const { data: catalog, isLoading } = useLabels();
  const setLabels = useSetIssueLabels(issue.id);
  const createLabel = useCreateLabel();
  const archiveLabel = useDeleteLabel();
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(PRESET_COLORS[3]);

  const selected = useMemo(
    () => new Set((issue.labels ?? []).map((l) => l.id)),
    [issue.labels],
  );

  function toggle(label: IssueLabel) {
    const next = new Set(selected);
    if (next.has(label.id)) next.delete(label.id);
    else next.add(label.id);
    setLabels.mutate([...next]);
  }

  function handleCreate() {
    const name = draftName.trim();
    if (!name) return;
    createLabel.mutate(
      { name, color: draftColor },
      {
        onSuccess: (lab) => {
          setDraftName('');
          const next = new Set(selected);
          next.add(lab.id);
          setLabels.mutate([...next]);
        },
      },
    );
  }

  function handleArchive(label: IssueLabel) {
    if (
      !window.confirm(
        `归档标签「${label.name}」？将从所有 Issue 上移除该标签（可之后用新名重建）。`,
      )
    ) {
      return;
    }
    archiveLabel.mutate(label.id);
  }

  return (
    <div className="issue-labels-editor">
      <div className="issue-labels-editor-head">
        <span className="issue-labels-editor-title">标签</span>
        {(setLabels.isPending || createLabel.isPending || archiveLabel.isPending) && (
          <span className="text-dim text-sm">保存中…</span>
        )}
      </div>
      <div className="issue-labels-chips">
        {(issue.labels ?? []).length === 0 ? (
          <span className="text-dim text-sm">未挂标签</span>
        ) : (
          (issue.labels ?? []).map((l) => (
            <Link
              key={l.id}
              href={`/?label=${encodeURIComponent(l.id)}`}
              className="issue-label-chip issue-label-chip--link"
              style={{ ['--label-color' as string]: l.color }}
              title={`看板筛选标签：${l.name}`}
              data-testid="issue-label-board-link"
              data-label-id={l.id}
            >
              <span className="issue-label-dot" />
              {l.name}
            </Link>
          ))
        )}
      </div>
      <div className="issue-labels-catalog" role="group" aria-label="选择标签">
        {isLoading && <span className="text-dim text-sm">加载标签目录…</span>}
        {(catalog ?? []).map((l) => {
          const on = selected.has(l.id);
          return (
            <div key={l.id} className="issue-label-row">
              <button
                type="button"
                className={`issue-label-toggle${on ? ' is-on' : ''}`}
                style={{ ['--label-color' as string]: l.color }}
                onClick={() => toggle(l)}
                disabled={setLabels.isPending}
              >
                <span className="issue-label-dot" />
                {l.name}
              </button>
              <Link
                href={`/?label=${encodeURIComponent(l.id)}`}
                className="issue-label-board-btn"
                title="看板筛选此标签"
                data-testid="issue-label-catalog-board"
                data-label-id={l.id}
              >
                看板
              </Link>
              <button
                type="button"
                className="issue-label-archive-btn"
                title="归档标签"
                disabled={archiveLabel.isPending}
                onClick={() => handleArchive(l)}
              >
                归档
              </button>
            </div>
          );
        })}
      </div>
      <div className="issue-labels-create">
        <input
          className="issue-labels-create-input"
          placeholder="新建标签名…"
          value={draftName}
          maxLength={40}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCreate();
            }
          }}
        />
        <div className="issue-labels-color-row" role="group" aria-label="标签颜色">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`issue-labels-color-swatch${draftColor === c ? ' is-on' : ''}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => setDraftColor(c)}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={!draftName.trim() || createLabel.isPending}
          onClick={handleCreate}
        >
          创建并挂上
        </button>
      </div>
    </div>
  );
}
