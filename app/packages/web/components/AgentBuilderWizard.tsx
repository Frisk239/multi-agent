'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentTemplate, CreateAgentInput, RuntimeId } from '@ma/shared';
import {
  useAgentTemplates,
  useCreateAgent,
  useCreateAgentFromTemplate,
  useRuntimeModels,
} from '@/lib/api';

const RUNTIMES: RuntimeId[] = ['claude-code', 'opencode', 'cursor', 'grok'];

/** API 不可用时的本地兜底（与 shared AGENT_TEMPLATES 对齐的最小集） */
const FALLBACK_TEMPLATES: AgentTemplate[] = [
  {
    id: 'fullstack',
    title: '全栈研发',
    summary: '前后端一体实现功能、修 bug、写测试',
    name: '全栈研发',
    category: '研发',
    runtime: 'opencode',
    model: null,
    thinkingLevel: null,
    concurrency: 2,
    instructions:
      '你是资深全栈工程师。目标是交付可合并、可维护的代码改动。先读再改，小步交付，改完自检。',
    allowedPaths: null,
    mcpServers: null,
    icon: '💻',
  },
  {
    id: 'reviewer',
    title: '代码审查',
    summary: '聚焦正确性、安全、可维护性与回归风险',
    name: '代码审查官',
    category: '审查',
    runtime: 'claude-code',
    model: null,
    thinkingLevel: null,
    concurrency: 2,
    instructions:
      '你是严格但建设性的代码审查官。按 blocking / nits / 疑问输出，并给修改建议。',
    allowedPaths: null,
    mcpServers: null,
    icon: '👀',
  },
  {
    id: 'docs',
    title: '文档撰写',
    summary: 'README、API、操作手册与变更说明',
    name: '文档撰写',
    category: '文档',
    runtime: 'cursor',
    model: null,
    thinkingLevel: null,
    concurrency: 1,
    instructions:
      '你是技术文档作者。结构：背景 → 用法 → 示例 → 边界/FAQ。命令可复制可运行。',
    allowedPaths: null,
    mcpServers: null,
    icon: '📝',
  },
];

export function AgentBuilderWizard({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const create = useCreateAgent();
  const createFromTemplate = useCreateAgentFromTemplate();
  const { data: remoteTemplates, isLoading: templatesLoading, isError: templatesError } =
    useAgentTemplates();

  const templates = useMemo(
    () => (remoteTemplates && remoteTemplates.length > 0 ? remoteTemplates : FALLBACK_TEMPLATES),
    [remoteTemplates],
  );

  const [step, setStep] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
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

  const isSubmitting = create.isPending || createFromTemplate.isPending;

  function applyTemplate(tpl: AgentTemplate) {
    setSelectedTemplateId(tpl.id);
    setName(tpl.name);
    setCategory(tpl.category);
    setRuntime(tpl.runtime);
    setModel(tpl.model ?? '');
    setThinkingLevel(tpl.thinkingLevel ?? '');
    setConcurrency(tpl.concurrency);
    setInstructions(tpl.instructions);
    setAllowedPaths(tpl.allowedPaths ?? '');
    setMcpServers(tpl.mcpServers ?? '');
    setStep(1);
  }

  function handleBlank() {
    setSelectedTemplateId(null);
    setName('');
    setCategory('');
    setRuntime('opencode');
    setModel('');
    setThinkingLevel('');
    setConcurrency(1);
    setInstructions('');
    setAllowedPaths('');
    setMcpServers('');
    setStep(1);
  }

  function submit() {
    if (!name.trim()) return;

    const overrides = {
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

    const onSuccess = (agent: { id: string }) => {
      router.push(`/agents/${agent.id}`);
    };

    // 有模板 id 时走 create-from-template（一键物化）；空白则走普通创建
    if (selectedTemplateId) {
      createFromTemplate.mutate(
        { templateId: selectedTemplateId, overrides },
        { onSuccess },
      );
      return;
    }

    const input: CreateAgentInput = {
      ...overrides,
    };
    create.mutate(input, { onSuccess });
  }

  return (
    <div className="surface-card" style={{ padding: '20px', margin: '20px 0' }} data-testid="agent-builder-wizard">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>新建智能体</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>关闭</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['模板', '1. 基本信息', '2. 运行时与模型', '3. 能力边界', '4. 指令'].map((s, i) => (
          <div
            key={i}
            style={{
              fontWeight: step === i ? 'bold' : 'normal',
              color: step === i ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {s} {i < 4 && '>'}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div data-testid="builder-step-0">
          <p style={{ marginTop: 0 }}>
            从本地高频模板开始，或空白创建。模板不含密钥，创建后即可使用。
          </p>
          {templatesLoading ? (
            <p className="text-dim" data-testid="templates-loading">加载模板中…</p>
          ) : null}
          {templatesError ? (
            <p className="text-dim" data-testid="templates-fallback-hint">
              模板接口暂不可用，已使用本地兜底清单。
            </p>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '12px',
              marginTop: '10px',
            }}
            data-testid="agent-template-gallery"
          >
            <div
              style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}
              onClick={handleBlank}
              data-testid="template-blank"
            >
              <div style={{ fontSize: '24px' }}>✨</div>
              <h3 style={{ margin: '8px 0', fontSize: '15px' }}>空白智能体</h3>
              <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '13px' }}>从零配置</p>
            </div>
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => applyTemplate(tpl)}
                data-testid={`template-${tpl.id}`}
              >
                <div style={{ fontSize: '24px' }}>{tpl.icon}</div>
                <h3 style={{ margin: '8px 0', fontSize: '15px' }}>{tpl.title}</h3>
                <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '13px' }}>{tpl.summary}</p>
                <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                  {tpl.category} · {tpl.runtime}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div data-testid="builder-step-1" className="ops-form-grid">
          <label className="ops-field">
            <span>名称 *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="智能体名称"
              data-testid="builder-name-input"
              autoFocus
            />
          </label>
          <label className="ops-field">
            <span>分类</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="如：研发、审查、文档"
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>上一步</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)} disabled={!name.trim()}>
              下一步
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div data-testid="builder-step-2" className="ops-form-grid">
          <label className="ops-field">
            <span>运行时</span>
            <select value={runtime} onChange={(e) => setRuntime(e.target.value as RuntimeId)}>
              {RUNTIMES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>模型</span>
            <select
              value={model && (createModelCatalog?.models ?? []).some((m) => m.id === model) ? model : model ? '__custom__' : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') return;
                setModel(v);
              }}
            >
              <option value="">{createModelsLoading ? '加载模型…' : 'CLI 默认（未指定）'}</option>
              {(createModelCatalog?.models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.isDefault ? '（推荐）' : ''}
                </option>
              ))}
              {model && !(createModelCatalog?.models ?? []).some((m) => m.id === model) ? (
                <option value="__custom__">{model}（当前）</option>
              ) : null}
            </select>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="或输入自定义模型 ID"
              className="agent-model-freeform"
            />
          </label>
          <label className="ops-field">
            <span>并发</span>
            <input
              type="number"
              min={1}
              max={8}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>上一步</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>下一步</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div data-testid="builder-step-3" className="ops-form-grid">
          <label className="ops-field">
            <span>允许路径（可选）</span>
            <input
              value={allowedPaths}
              onChange={(e) => setAllowedPaths(e.target.value)}
              placeholder="如：./src, ./packages"
            />
          </label>
          <label className="ops-field">
            <span>MCP 服务（可选，无密钥）</span>
            <input
              value={mcpServers}
              onChange={(e) => setMcpServers(e.target.value)}
              placeholder="如：exa, weather"
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>上一步</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>下一步</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div data-testid="builder-step-4" className="ops-form-grid">
          <label className="ops-field" style={{ gridColumn: '1 / -1' }}>
            <span>系统提示 / 指令</span>
            <textarea
              className="ops-textarea"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="执行时注入的指令"
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}>上一步</button>
            {selectedTemplateId ? (
              <button
                type="button"
                className="btn btn-ghost"
                data-testid="builder-quick-create"
                disabled={isSubmitting || !name.trim()}
                onClick={submit}
                title="使用当前表单从模板一键创建"
              >
                {isSubmitting ? '创建中…' : '从模板创建'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={isSubmitting || !name.trim()}
              data-testid="builder-submit"
            >
              {isSubmitting ? '创建中…' : selectedTemplateId ? '确认创建' : '创建智能体'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
