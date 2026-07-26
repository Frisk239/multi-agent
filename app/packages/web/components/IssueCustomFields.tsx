'use client';

import { useState } from 'react';
import type { Issue } from '@ma/shared';
import { useUpdateIssue } from '@/lib/api';

const PRESET_KEYS = ['环境', '影响版本', '模块', 'JiraID'];

export function IssueCustomFields({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();
  const [editingNew, setEditingNew] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [valDraft, setValDraft] = useState('');

  // 内联编辑已有字段
  const [inlineKey, setInlineKey] = useState<string | null>(null);
  const [inlineVal, setInlineVal] = useState('');

  const fields = issue.customFields || {};
  const entries = Object.entries(fields);

  function handleSaveNewField() {
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
          setEditingNew(false);
        },
      }
    );
  }

  function handleSaveInlineField(k: string) {
    const v = inlineVal.trim();
    if (!v) return;
    const nextFields = { ...fields, [k]: v };
    update.mutate(
      { id: issue.id, input: { customFields: nextFields } },
      {
        onSuccess: () => {
          setInlineKey(null);
          setInlineVal('');
        },
      }
    );
  }

  function handleDeleteField(k: string) {
    const nextFields = { ...fields };
    delete nextFields[k];
    update.mutate({ id: issue.id, input: { customFields: nextFields } });
  }

  function startInlineEdit(k: string, currentVal: string) {
    setInlineKey(k);
    setInlineVal(currentVal);
  }

  return (
    <div className="issue-custom-fields issue-props-card border-t border-slate-200 pt-3 mt-3" data-testid="issue-custom-fields">
      <div className="flex items-center justify-between mb-2">
        <span className="issue-meta-k text-sm font-medium text-slate-700" style={{ width: 'auto' }}>
          自定义字段
        </span>
        {!editingNew && (
          <button
            type="button"
            className="btn-ghost btn-sm text-xs text-blue-600 hover:text-blue-800"
            onClick={() => setEditingNew(true)}
            data-testid="add-custom-field"
          >
            + 添加字段
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="custom-fields-list text-sm flex flex-col gap-1.5 mb-2">
          {entries.map(([k, v]) => {
            const isEditingThis = inlineKey === k;
            return (
              <div
                key={k}
                className="flex justify-between items-center group py-0.5 px-1 rounded hover:bg-slate-50 transition-colors"
                data-testid={`custom-field-item-${k}`}
              >
                {isEditingThis ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-dim text-xs font-semibold whitespace-nowrap">{k}:</span>
                    <input
                      className="input-sm border border-slate-300 rounded px-2 py-0.5 text-xs flex-1"
                      value={inlineVal}
                      onChange={(e) => setInlineVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveInlineField(k);
                        } else if (e.key === 'Escape') {
                          setInlineKey(null);
                        }
                      }}
                      data-testid={`inline-edit-input-${k}`}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn-primary btn-sm text-xs px-2 py-0.5"
                      onClick={() => handleSaveInlineField(k)}
                      disabled={update.isPending || !inlineVal.trim()}
                      data-testid={`save-inline-edit-${k}`}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-xs px-1.5 py-0.5"
                      onClick={() => setInlineKey(null)}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                      <span className="text-dim text-xs font-medium whitespace-nowrap">{k}:</span>
                      <span
                        className="text-slate-800 text-xs font-medium truncate cursor-pointer hover:underline"
                        title="点击内联编辑"
                        onClick={() => startInlineEdit(k, v)}
                        data-testid={`custom-field-value-${k}`}
                      >
                        {v}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        className="text-xs text-blue-500 hover:text-blue-700 px-1 rounded"
                        onClick={() => startInlineEdit(k, v)}
                        title="编辑此字段"
                        data-testid={`edit-custom-field-${k}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700 px-1 rounded"
                        onClick={() => handleDeleteField(k)}
                        title="删除此字段"
                        data-testid={`delete-custom-field-${k}`}
                      >
                        ×
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingNew && (
        <div className="custom-fields-editor flex flex-col gap-2 mt-2 bg-slate-50 p-2.5 rounded border border-slate-200">
          <div className="flex flex-wrap gap-1 mb-1">
            <span className="text-xs text-dim mr-1 self-center">快捷键名:</span>
            {PRESET_KEYS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="text-xs px-2 py-0.5 rounded bg-slate-200 hover:bg-blue-100 hover:text-blue-700 text-slate-700 transition-colors"
                onClick={() => setKeyDraft(preset)}
                data-testid={`preset-chip-${preset}`}
              >
                {preset}
              </button>
            ))}
          </div>

          <input
            className="input-sm border border-slate-300 rounded px-2 py-1 text-xs w-full"
            placeholder="字段名 (如: 环境, 影响版本, 模块, JiraID)"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            data-testid="custom-field-input-key"
            autoFocus
          />
          <input
            className="input-sm border border-slate-300 rounded px-2 py-1 text-xs w-full"
            placeholder="字段值 (如: Staging / v1.2.0)"
            value={valDraft}
            onChange={(e) => setValDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveNewField();
              }
            }}
            data-testid="custom-field-input-value"
          />
          <div className="flex gap-2 justify-end mt-1">
            <button
              type="button"
              className="btn-ghost btn-sm text-xs"
              onClick={() => {
                setEditingNew(false);
                setKeyDraft('');
                setValDraft('');
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-primary btn-sm text-xs"
              onClick={handleSaveNewField}
              disabled={update.isPending || !keyDraft.trim() || !valDraft.trim()}
              data-testid="save-custom-field"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
