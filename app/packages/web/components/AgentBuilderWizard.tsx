'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreateAgentInput, RuntimeId } from '@ma/shared';
import { useCreateAgent, useRuntimeModels } from '@/lib/api';

const RUNTIMES: RuntimeId[] = ['claude-code', 'opencode', 'cursor', 'grok'];

const TEMPLATES = [
  {
    id: 'fullstack',
    name: 'Fullstack Dev',
    category: 'Fullstack',
    runtime: 'opencode' as RuntimeId,
    instructions: 'You are an expert fullstack developer. Write robust, maintainable code.',
    icon: '💻'
  },
  {
    id: 'reviewer',
    name: 'Code Reviewer',
    category: 'Reviewer',
    runtime: 'claude-code' as RuntimeId,
    instructions: 'Review code focusing on coding standards, security, and performance.',
    icon: '👀'
  },
  {
    id: 'docs',
    name: 'Docs Writer',
    category: 'Documentation',
    runtime: 'cursor' as RuntimeId,
    instructions: 'Write clear and concise documentation for the codebase.',
    icon: '📝'
  }
];

export function AgentBuilderWizard({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const create = useCreateAgent();
  
  const [step, setStep] = useState(0);
  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [runtime, setRuntime] = useState<RuntimeId>('opencode');
  const [model, setModel] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [allowedPaths, setAllowedPaths] = useState('');
  const [mcpServers, setMcpServers] = useState('');
  const [instructions, setInstructions] = useState('');

  const { data: createModelCatalog, isFetching: createModelsLoading } =
    useRuntimeModels(runtime);

  function handleTemplateSelect(tpl: typeof TEMPLATES[0]) {
    setName(tpl.name);
    setCategory(tpl.category);
    setRuntime(tpl.runtime);
    setInstructions(tpl.instructions);
    setStep(1); // Skip gallery, go to step 1
  }

  function submit() {
    if (!name.trim()) return;
    const input: CreateAgentInput = {
      name: name.trim(),
      runtime,
      model: model.trim() ? model.trim() : null,
      thinkingLevel: thinkingLevel.trim() ? thinkingLevel.trim() : null,
      category: category.trim() ? category.trim() : null,
      concurrency,
      instructions,
      allowedPaths: allowedPaths.trim() ? allowedPaths.trim() : null,
      mcpServers: mcpServers.trim() ? mcpServers.trim() : null,
    };
    create.mutate(input, {
      onSuccess: (agent) => {
        router.push(`/agents/${agent.id}`);
      },
    });
  }

  return (
    <div className="surface-card" style={{ padding: '20px', margin: '20px 0' }} data-testid="agent-builder-wizard">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>新建智能体 - Agent Builder</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>关闭</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {['Template', '1. Basic Info', '2. Runtime & Model', '3. Skills', '4. Instructions'].map((s, i) => (
          <div 
            key={i} 
            style={{ 
              fontWeight: step === i ? 'bold' : 'normal',
              color: step === i ? 'var(--text-primary)' : 'var(--text-muted)'
            }}
          >
            {s} {i < 4 && '>'}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div data-testid="builder-step-0">
          <p>Choose a template or start from scratch:</p>
          <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
            <div 
              style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', flex: 1 }}
              onClick={() => setStep(1)}
              data-testid="template-blank"
            >
              <div style={{ fontSize: '24px' }}>✨</div>
              <h3 style={{ margin: '8px 0' }}>Blank Agent</h3>
              <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '14px' }}>Start from scratch</p>
            </div>
            {TEMPLATES.map(tpl => (
              <div 
                key={tpl.id}
                style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', flex: 1 }}
                onClick={() => handleTemplateSelect(tpl)}
                data-testid={`template-${tpl.id}`}
              >
                <div style={{ fontSize: '24px' }}>{tpl.icon}</div>
                <h3 style={{ margin: '8px 0' }}>{tpl.name}</h3>
                <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '14px' }}>{tpl.category}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div data-testid="builder-step-1" className="ops-form-grid">
          <label className="ops-field">
            <span>Name *</span>
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Agent Name"
              data-testid="builder-name-input"
              autoFocus
            />
          </label>
          <label className="ops-field">
            <span>Category</span>
            <input 
              value={category} 
              onChange={e => setCategory(e.target.value)} 
              placeholder="e.g. Frontend, Reviewer"
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)} disabled={!name.trim()}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div data-testid="builder-step-2" className="ops-form-grid">
          <label className="ops-field">
            <span>Runtime</span>
            <select value={runtime} onChange={e => setRuntime(e.target.value as RuntimeId)}>
              {RUNTIMES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>Model</span>
            <select
              value={model && (createModelCatalog?.models ?? []).some((m) => m.id === model) ? model : model ? '__custom__' : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') return;
                setModel(v);
              }}
            >
              <option value="">{createModelsLoading ? 'Loading models...' : 'CLI Default (Unspecified)'}</option>
              {(createModelCatalog?.models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.isDefault ? ' (Recommended)' : ''}
                </option>
              ))}
              {model && !(createModelCatalog?.models ?? []).some((m) => m.id === model) ? (
                <option value="__custom__">{model} (Current)</option>
              ) : null}
            </select>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Or enter custom model ID"
              className="agent-model-freeform"
            />
          </label>
          <label className="ops-field">
            <span>Concurrency</span>
            <input
              type="number"
              min={1} max={8}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div data-testid="builder-step-3" className="ops-form-grid">
          <label className="ops-field">
            <span>Allowed Paths (Optional)</span>
            <input 
              value={allowedPaths} 
              onChange={e => setAllowedPaths(e.target.value)} 
              placeholder="e.g. ./src, ./packages"
            />
          </label>
          <label className="ops-field">
            <span>MCP Servers (Optional)</span>
            <input 
              value={mcpServers} 
              onChange={e => setMcpServers(e.target.value)} 
              placeholder="e.g. exa, weather"
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>Next</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div data-testid="builder-step-4" className="ops-form-grid">
          <label className="ops-field" style={{ gridColumn: '1 / -1' }}>
            <span>System Prompt / Instructions</span>
            <textarea
              className="ops-textarea"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Instructions injected during agent execution"
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={submit}
              disabled={create.isPending || !name.trim()}
              data-testid="builder-submit"
            >
              {create.isPending ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
