import { spawn } from 'node:child_process';
import type { RuntimeId } from '@ma/shared';
import { getBackend } from './registry.js';

export type RuntimeModel = {
  id: string;
  label: string;
  provider?: string;
  /** CLI 广告的默认项（仅展示） */
  isDefault?: boolean;
};

function parseProvider(id: string): string | undefined {
  const i = id.indexOf('/');
  return i > 0 ? id.slice(0, i) : undefined;
}

function runCmd(
  cmd: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve({ code: null, stdout, stderr: stderr || 'timeout' });
    }, timeoutMs);
    child.stdout?.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr?.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** opencode models → 一行一个 id（如 opencode/big-pickle） */
async function listOpencodeModels(execPath: string): Promise<RuntimeModel[]> {
  const { code, stdout, stderr } = await runCmd(execPath, ['models']);
  if (code !== 0 && !stdout.trim()) {
    throw new Error(stderr.trim() || `opencode models exit ${code}`);
  }
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('⠀') && !l.includes('█') && l.includes('/'));
  const seen = new Set<string>();
  const out: RuntimeModel[] = [];
  for (const id of lines) {
    // 过滤 banner/噪声，模型 id 通常 provider/name
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:+-]+$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: id,
      provider: parseProvider(id),
      isDefault: id === 'opencode/big-pickle' || undefined,
    });
  }
  return out;
}

/** Claude Code：无稳定 list 时给常用别名（空 model=CLI 默认） */
function listClaudeStatic(): RuntimeModel[] {
  return [
    { id: 'sonnet', label: 'sonnet（常用）', provider: 'anthropic' },
    { id: 'opus', label: 'opus', provider: 'anthropic' },
    { id: 'haiku', label: 'haiku', provider: 'anthropic' },
  ];
}

/** Cursor：尽量探测；失败回退空列表（手填） */
async function listCursorModels(execPath: string): Promise<RuntimeModel[]> {
  // 不同版本子命令不一；失败不抛致命，返回空让 UI 手填
  for (const args of [['models'], ['--list-models'], ['model', 'list']]) {
    const { code, stdout } = await runCmd(execPath, args, 12_000);
    if (code !== 0 || !stdout.trim()) continue;
    const ids = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('-') && l.length < 80);
    if (ids.length === 0) continue;
    return ids.slice(0, 80).map((id) => ({
      id,
      label: id,
      provider: parseProvider(id),
    }));
  }
  return [];
}

/**
 * G22 续：按 runtime 发现可选模型。
 * - opencode：`opencode models`（本机实测）
 * - claude-code：静态常用别名
 * - cursor：尽力探测，否则 []
 * - grok：静态 xAI 模型（Multica grok_test 常用 id）
 */
export async function listRuntimeModels(runtime: RuntimeId): Promise<{
  runtime: RuntimeId;
  installed: boolean;
  models: RuntimeModel[];
  source: 'cli' | 'static' | 'empty';
  error: string | null;
}> {
  const { listGrokStaticModels } = await import('./grok.js');
  const staticFallback =
    runtime === 'claude-code'
      ? listClaudeStatic()
      : runtime === 'grok'
        ? listGrokStaticModels()
        : [];

  const backend = getBackend(runtime);
  const det = await backend.detect();
  if (!det.installed || !det.path) {
    return {
      runtime,
      installed: false,
      models: staticFallback,
      source: staticFallback.length ? 'static' : 'empty',
      error: 'runtime 未安装或不在 PATH',
    };
  }

  try {
    if (runtime === 'opencode') {
      const models = await listOpencodeModels(det.path);
      return {
        runtime,
        installed: true,
        models,
        source: 'cli',
        error: models.length ? null : 'opencode models 无输出',
      };
    }
    if (runtime === 'claude-code') {
      return {
        runtime,
        installed: true,
        models: listClaudeStatic(),
        source: 'static',
        error: null,
      };
    }
    if (runtime === 'cursor') {
      const models = await listCursorModels(det.path);
      return {
        runtime,
        installed: true,
        models,
        source: models.length ? 'cli' : 'empty',
        error: models.length ? null : 'cursor 未提供稳定 models 列表，可手填',
      };
    }
    if (runtime === 'grok') {
      return {
        runtime,
        installed: true,
        models: listGrokStaticModels(),
        source: 'static',
        error: null,
      };
    }
  } catch (e) {
    return {
      runtime,
      installed: true,
      models: staticFallback,
      source: staticFallback.length ? 'static' : 'empty',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { runtime, installed: true, models: [], source: 'empty', error: null };
}
