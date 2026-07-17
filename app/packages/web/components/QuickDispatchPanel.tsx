'use client';

import { useState } from 'react';
import { useAgents, useSquads, useCreateQuickRun } from '@/lib/api';
import type { AgentSummary, SquadSummary } from '@ma/shared';

type QuickDispatchPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function QuickDispatchPanel({ open, onClose }: QuickDispatchPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [assigneeType, setAssigneeType] = useState<'agent' | 'squad'>('agent');
  const [assigneeId, setAssigneeId] = useState('');
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const createQuickRun = useCreateQuickRun();

  if (!open) return null;

  const handleSubmit = async () => {
    if (!prompt.trim() || !assigneeId) return;
    try {
      await createQuickRun.mutateAsync({
        prompt: prompt.trim(),
        assignee: { type: assigneeType, id: assigneeId },
      });
      setPrompt('');
      setAssigneeId('');
      onClose();
    } catch {
      // error handled by useMutation
    }
  };

  const assignees = assigneeType === 'agent' ? agents : squads;

  return (
    <div className="cmdk-overlay" role="presentation" onClick={onClose}>
      <div
        className="cmdk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="快速派活"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div style={{ padding: '16px 16px 8px', fontWeight: 600, fontSize: 15 }}>
          快速派活
        </div>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>
              指派给
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={assigneeType}
                onChange={(e) => {
                  setAssigneeType(e.target.value as 'agent' | 'squad');
                  setAssigneeId('');
                }}
                style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd' }}
              >
                <option value="agent">智能体</option>
                <option value="squad">小队</option>
              </select>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd' }}
              >
                <option value="">选择...</option>
                {assignees.map((a: AgentSummary | SquadSummary) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>
              任务描述
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="用自然语言描述你想让 agent 做什么..."
              rows={4}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: 4,
                border: '1px solid #ddd',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #ddd',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!prompt.trim() || !assigneeId || createQuickRun.isPending}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: 'none',
                background: createQuickRun.isPending ? '#ccc' : '#0066cc',
                color: '#fff',
                cursor: createQuickRun.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {createQuickRun.isPending ? '派发中...' : '派活'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
