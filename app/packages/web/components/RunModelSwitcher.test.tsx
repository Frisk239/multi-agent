import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RunModelSwitcher } from './RunModelSwitcher';

/**
 * Q1 · 运行中 set_model 切换（pi RPC mid-run）：
 * - 下拉渲染 /api/runtimes/:id/models catalog；currentModel 初始选中
 * - 选择/手填模型 → set_model { provider, modelId }（provider 从 id 前缀解析，无前缀回退 runtime）
 * - 空输入禁用；Enter 发送
 */

const mutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useRuntimeModels: (runtime: string) => ({
    data:
      runtime === 'pi'
        ? {
            runtime: 'pi',
            installed: true,
            models: [
              { id: 'deepseek/deepseek-v4-pro', label: 'deepseek-v4-pro', provider: 'deepseek' },
              { id: 'anthropic/sonnet', label: 'sonnet', provider: 'anthropic', isDefault: true },
            ],
            source: 'empty',
            error: 'pi 未提供稳定 models 列表，可手填',
          }
        : { runtime, installed: true, models: [], source: 'empty', error: null },
    isFetching: false,
  }),
  useSendRunCommand: () => ({ mutate, isPending: false }),
}));

describe('RunModelSwitcher', () => {
  beforeEach(() => {
    mutate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('渲染 catalog 模型选项 + 当前模型占位', () => {
    render(<RunModelSwitcher runId="run-1" runtime="pi" currentModel="deepseek/deepseek-v4-pro" />);
    expect(screen.getByTestId('run-detail-set-model')).toBeTruthy();
    const options = screen.getAllByRole('option');
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain('deepseek-v4-pro');
    expect(labels).toContain('sonnet · 推荐');
    // 当前模型已在 catalog → 初始选中
    expect(screen.getByTestId('run-detail-set-model-select')).toHaveProperty(
      'value',
      'deepseek/deepseek-v4-pro',
    );
  });

  it('选模型 → 发送 set_model（provider/modelId 从 id 拆分）', () => {
    render(<RunModelSwitcher runId="run-1" runtime="pi" currentModel={null} />);
    fireEvent.change(screen.getByTestId('run-detail-set-model-select'), {
      target: { value: 'anthropic/sonnet' },
    });
    fireEvent.click(screen.getByTestId('run-detail-set-model-send'));
    expect(mutate).toHaveBeenCalledWith({
      command: 'set_model',
      provider: 'anthropic',
      modelId: 'sonnet',
    });
  });

  it('手填无前缀 id → provider 回退 runtime；Enter 发送', () => {
    render(<RunModelSwitcher runId="run-1" runtime="pi" currentModel={null} />);
    fireEvent.change(screen.getByTestId('run-detail-set-model-input'), {
      target: { value: 'my-custom-model' },
    });
    fireEvent.keyDown(screen.getByTestId('run-detail-set-model-input'), { key: 'Enter' });
    expect(mutate).toHaveBeenCalledWith({
      command: 'set_model',
      provider: 'pi',
      modelId: 'my-custom-model',
    });
  });

  it('空输入 → 发送按钮禁用', () => {
    render(<RunModelSwitcher runId="run-1" runtime="pi" currentModel={null} />);
    expect(screen.getByTestId('run-detail-set-model-send')).toHaveProperty('disabled', true);
  });

  it('catalog 无匹配的手填值 → select 显示「（当前）」自定义项', () => {
    render(<RunModelSwitcher runId="run-1" runtime="pi" currentModel="grok-4.5" />);
    // grok-4.5 不在 pi catalog → 自定义占位 + 手填值
    expect(screen.getByTestId('run-detail-set-model-input')).toHaveProperty('value', 'grok-4.5');
    expect(screen.getByTestId('run-detail-set-model-select')).toHaveProperty('value', '__custom__');
  });
});
