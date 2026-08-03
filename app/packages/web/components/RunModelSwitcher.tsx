'use client';

import { useState } from 'react';
import type { RuntimeId } from '@ma/shared';
import { useRuntimeModels, useSendRunCommand } from '@/lib/api';

/**
 * Q1：运行中 set_model 切换（pi RPC mid-run，G1-1 命令面子集）。
 * - 下拉 = GET /api/runtimes/:id/models（pi 无稳定列表 → 手填兜底，与 AgentDetailPage 同模式）
 * - provider/modelId 拆分对齐上游 pi rpc-types.ts:32 `set_model { provider, modelId }`：
 *   模型 id 形如 `provider/modelId` 时拆分（如 moonshotai-cn/kimi-k2-0711-preview），
 *   无前缀则 provider 回退 runtime
 * - grok ACP 不支持运行中 set_model（诚实 501），渲染与否由 RunDetailPage 按 runtime 控制
 */
function parseModelId(id: string, fallback: string): { provider: string; modelId: string } {
  const i = id.indexOf('/');
  if (i > 0) {
    return { provider: id.slice(0, i), modelId: id.slice(i + 1) };
  }
  return { provider: fallback, modelId: id };
}

export function RunModelSwitcher({
  runId,
  runtime,
  currentModel,
}: {
  runId: string;
  runtime: RuntimeId;
  currentModel: string | null | undefined;
}) {
  const { data: catalog, isFetching: modelsLoading } = useRuntimeModels(runtime);
  const cmd = useSendRunCommand(runId);
  const [modelId, setModelId] = useState(currentModel ?? '');

  const send = () => {
    const id = modelId.trim();
    if (!id || cmd.isPending) return;
    const { provider, modelId: mid } = parseModelId(id, runtime);
    cmd.mutate({ command: 'set_model', provider, modelId: mid });
  };

  const models = catalog?.models ?? [];

  return (
    <div
      className="run-detail-set-model"
      data-testid="run-detail-set-model"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      title="pi RPC 运行中命令：set_model 切换模型（后续 turn 生效）"
    >
      <select
        data-testid="run-detail-set-model-select"
        value={
          modelId && models.some((m) => m.id === modelId)
            ? modelId
            : modelId
              ? '__custom__'
              : ''
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v !== '__custom__') setModelId(v);
        }}
      >
        <option value="">
          {modelsLoading ? '加载模型…' : currentModel?.trim() || 'CLI 默认（不切换）'}
        </option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.isDefault ? ' · 推荐' : ''}
          </option>
        ))}
        {modelId && !models.some((m) => m.id === modelId) ? (
          <option value="__custom__">{modelId}（当前）</option>
        ) : null}
      </select>
      <input
        type="text"
        data-testid="run-detail-set-model-input"
        placeholder="或手填 model id"
        list="run-detail-model-suggestions"
        value={modelId}
        onChange={(e) => setModelId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && modelId.trim() && !cmd.isPending) {
            send();
          }
        }}
        autoComplete="off"
        style={{ width: 180 }}
      />
      <datalist id="run-detail-model-suggestions">
        {models.slice(0, 80).map((m) => (
          <option key={m.id} value={m.id} />
        ))}
      </datalist>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        data-testid="run-detail-set-model-send"
        disabled={!modelId.trim() || cmd.isPending}
        onClick={() => send()}
      >
        {cmd.isPending ? '切换中…' : '切换模型'}
      </button>
    </div>
  );
}
