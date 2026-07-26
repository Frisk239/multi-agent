'use client';

import { useState } from 'react';
import type { Issue } from '@ma/shared';
import { useUpdateIssue } from '@/lib/api';

export function IssueCustomFields({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();
  const [editing, setEditing] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [valDraft, setValDraft] = useState('');
  
  const fields = issue.customFields || {};
  const entries = Object.entries(fields);

  function handleSaveField() {
    const k = keyDraft.trim();
    const v = valDraft.trim();
    if (!k || !v) return;
    const nextFields = { ...fields, [k]: v };
    update.mutate(
      { id: issue.id, input: { customFields: nextFields } },
      {
        onSuccess: () => {
          setKeyDraft('');
          setValDraft('');
          setEditing(false);
        },
      }
    );
  }

  function handleDeleteField(k: string) {
    const nextFields = { ...fields };
    delete nextFields[k];
    update.mutate({ id: issue.id, input: { customFields: nextFields } });
  }

  return (
    <div className="issue-custom-fields" data-testid="issue-custom-fields">
      <div className="flex items-center justify-between mb-2">
        <span className="issue-meta-k" style={{ width: 'auto' }}>自定义字段</span>
        {!editing && (
          <button
            type="button"
            className="btn-ghost btn-sm text-xs"
            onClick={() => setEditing(true)}
            data-testid="add-custom-field"
          >
            + 添加
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="custom-fields-list text-sm flex flex-col gap-1 mb-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between items-start group">
              <div className="flex gap-2">
                <span className="text-dim">{k}:</span>
                <span>{v}</span>
              </div>
              <button
                type="button"
                className="text-red-500 opacity-0 group-hover:opacity-100 px-1 hover:bg-red-50 rounded transition-opacity"
                onClick={() => handleDeleteField(k)}
                title="删除此字段"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="custom-fields-editor flex flex-col gap-2 mt-2 bg-slate-50 p-2 rounded border border-slate-200">
          <input
            className="input-sm border border-slate-300 rounded px-2 py-1 text-sm w-full"
            placeholder="字段名 (例如: 环境)"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            autoFocus
          />
          <input
            className="input-sm border border-slate-300 rounded px-2 py-1 text-sm w-full"
            placeholder="字段值 (例如: Staging)"
            value={valDraft}
            onChange={(e) => setValDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveField();
              }
            }}
          />
          <div className="flex gap-2 justify-end mt-1">
            <button
              type="button"
              className="btn-ghost btn-sm text-xs"
              onClick={() => {
                setEditing(false);
                setKeyDraft('');
                setValDraft('');
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-primary btn-sm text-xs"
              onClick={handleSaveField}
              disabled={update.isPending || !keyDraft.trim() || !valDraft.trim()}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
