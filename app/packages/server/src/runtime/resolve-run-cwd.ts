// 按 run.kind 解析 CLI 工作目录（学 Multica execenv.Prepare）。
//
// Multica（server/internal/daemon/execenv/execenv.go）：
// - 默认：{WorkspacesRoot}/{workspaceId}/{taskShort}/workdir —— 空隔离目录
// - 仅 LocalWorkDir（project local_directory）时才用用户本机路径
// - 绝不把 daemon/控制台 process.cwd 当 agent Cwd
//
// 本仓本地化：
// - 默认 root：~/.multi-agent/run-workspaces 与 chat-sessions
// - issue：按 issueId 稳定 workdir（同 issue 复用，近似 PriorWorkDir）
// - QC 无 issue：按 runId
// - chat：按 threadId
// - opt-in 宿主项目：MA_ISSUE_USE_WORKSPACE_CWD=1 / MA_CHAT_USE_WORKSPACE_CWD=1
//   → 使用 Settings/MA_WORKSPACE_CWD（未来接 project.local_path）

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  applyWorkspaceCwdToProcess,
  resolveWorkspaceCwd,
  type ResolvedWorkspaceCwd,
} from '../workspace-cwd.js';

export type RunCwdKind = 'issue' | 'quick_create' | 'chat' | string;

export type ResolvedRunCwd = {
  path: string | null;
  /**
   * isolated_issue | isolated_run | chat_scratch | workspace | none
   */
  mode:
    | 'isolated_issue'
    | 'isolated_run'
    | 'chat_scratch'
    | 'workspace'
    | 'none';
  exists: boolean;
  error: string | null;
  workspace?: ResolvedWorkspaceCwd;
};

const DEFAULT_WS_ID = 'ws-local';

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === '1' || v === 'true';
}

function ensureDir(path: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return existsSync(path);
  } catch {
    return false;
  }
}

/** 安全目录名：UUID 可保留；过长截断 */
function safeKey(id: string, max = 80): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, max);
}

/**
 * Multica: shortID = uuid 去横线后前 8 位；本地用完整 safe id 便于对照 issue。
 * 布局：~/.multi-agent/run-workspaces/{ws}/{issue|run}/workdir
 */
export function issueIsolatedWorkDir(
  workspaceId: string,
  issueId: string | null | undefined,
  runId: string,
): { path: string; mode: 'isolated_issue' | 'isolated_run' } {
  const ws = safeKey(workspaceId || DEFAULT_WS_ID, 64);
  if (issueId && issueId.trim()) {
    return {
      path: join(
        homedir(),
        '.multi-agent',
        'run-workspaces',
        ws,
        safeKey(issueId),
        'workdir',
      ),
      mode: 'isolated_issue',
    };
  }
  return {
    path: join(
      homedir(),
      '.multi-agent',
      'run-workspaces',
      ws,
      `run-${safeKey(runId)}`,
      'workdir',
    ),
    mode: 'isolated_run',
  };
}

/** chat 隔离：~/.multi-agent/chat-sessions/<threadOrRun>/workdir */
export function chatScratchWorkDir(
  threadId: string | null | undefined,
  runId: string,
): string {
  const key = (threadId && threadId.trim()) || runId;
  return join(homedir(), '.multi-agent', 'chat-sessions', safeKey(key), 'workdir');
}

function resolveWorkspacePath(): ResolvedRunCwd {
  let cwdInfo = resolveWorkspaceCwd();
  if (!cwdInfo.configured || !cwdInfo.exists) {
    cwdInfo = applyWorkspaceCwdToProcess();
  }
  if (!cwdInfo.path || !cwdInfo.exists) {
    return {
      path: null,
      mode: 'none',
      exists: false,
      error: cwdInfo.configured
        ? `工作区路径无效: ${cwdInfo.path}`
        : '未配置工作区目录（Settings 保存路径，或设置 MA_WORKSPACE_CWD）',
      workspace: cwdInfo,
    };
  }
  return {
    path: cwdInfo.path,
    mode: 'workspace',
    exists: true,
    error: null,
    workspace: cwdInfo,
  };
}

function resolveIsolated(
  kind: RunCwdKind,
  opts: {
    runId: string;
    issueId?: string | null;
    chatThreadId?: string | null;
    workspaceId?: string;
  },
): ResolvedRunCwd {
  if (kind === 'chat') {
    const path = chatScratchWorkDir(opts.chatThreadId, opts.runId);
    if (!ensureDir(path)) {
      return {
        path: null,
        mode: 'none',
        exists: false,
        error: `无法创建 chat 隔离工作目录: ${path}`,
      };
    }
    return { path, mode: 'chat_scratch', exists: true, error: null };
  }

  // issue | quick_create | 其它 → run-workspaces
  const { path, mode } = issueIsolatedWorkDir(
    opts.workspaceId ?? DEFAULT_WS_ID,
    opts.issueId,
    opts.runId,
  );
  if (!ensureDir(path)) {
    return {
      path: null,
      mode: 'none',
      exists: false,
      error: `无法创建 run 隔离工作目录: ${path}`,
    };
  }
  return { path, mode, exists: true, error: null };
}

/**
 * 解析本 run 的 CLI cwd。
 * - 默认：隔离目录（Multica execenv 精神）
 * - MA_ISSUE_USE_WORKSPACE_CWD / MA_CHAT_USE_WORKSPACE_CWD：显式用 Settings 工作区
 */
export function resolveRunCwd(opts: {
  kind: RunCwdKind;
  runId: string;
  issueId?: string | null;
  chatThreadId?: string | null;
  workspaceId?: string;
}): ResolvedRunCwd {
  const kind = opts.kind || 'issue';

  if (kind === 'chat') {
    if (envFlag('MA_CHAT_USE_WORKSPACE_CWD')) {
      return resolveWorkspacePath();
    }
    return resolveIsolated(kind, opts);
  }

  // issue / quick_create
  if (envFlag('MA_ISSUE_USE_WORKSPACE_CWD')) {
    return resolveWorkspacePath();
  }
  return resolveIsolated(kind, opts);
}
