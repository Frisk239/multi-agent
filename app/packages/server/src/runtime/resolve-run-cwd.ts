// 按 run.kind 解析 CLI 工作目录（学 Multica execenv）。
//
// Multica daemon（execenv.Prepare）：
// - 默认：每个 task 独立空 workdir（{workspacesRoot}/{ws}/{taskShort}/workdir）
// - 仅当 task 绑定 project 的 local_directory 资源时，才把 Cwd 指到用户本机目录
//
// 本仓差异（无 daemon / 无 project resource 状态机）：
// - issue / quick_create：继续用 workspace root（Settings MA_WORKSPACE_CWD / root_path）
// - chat：默认隔离 scratch，禁止误用 multi-agent 仓库根当「当前项目」
//
// chat 可显式 opt-in 工作区：MA_CHAT_USE_WORKSPACE_CWD=1
// 之后若加「会话选项目目录」，再把 path 写进 thread / run 即可。

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
  /** workspace | chat_scratch | none */
  mode: 'workspace' | 'chat_scratch' | 'none';
  exists: boolean;
  /** 给人看的失败原因 */
  error: string | null;
  /** workspace 解析细节（仅 mode=workspace 有） */
  workspace?: ResolvedWorkspaceCwd;
};

function ensureDir(path: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return existsSync(path);
  } catch {
    return false;
  }
}

/** chat 隔离根：~/.multi-agent/chat-sessions/<threadOrRun>/workdir */
export function chatScratchWorkDir(threadId: string | null | undefined, runId: string): string {
  const key = (threadId && threadId.trim()) || runId;
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return join(homedir(), '.multi-agent', 'chat-sessions', safe, 'workdir');
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

/**
 * issue/QC → workspace；chat → scratch（除非 MA_CHAT_USE_WORKSPACE_CWD=1）
 */
export function resolveRunCwd(opts: {
  kind: RunCwdKind;
  runId: string;
  chatThreadId?: string | null;
}): ResolvedRunCwd {
  const kind = opts.kind || 'issue';
  const useWorkspaceForChat =
    process.env.MA_CHAT_USE_WORKSPACE_CWD === '1' ||
    process.env.MA_CHAT_USE_WORKSPACE_CWD === 'true';

  if (kind === 'chat' && !useWorkspaceForChat) {
    const path = chatScratchWorkDir(opts.chatThreadId, opts.runId);
    if (!ensureDir(path)) {
      return {
        path: null,
        mode: 'none',
        exists: false,
        error: `无法创建 chat 隔离工作目录: ${path}`,
      };
    }
    return {
      path,
      mode: 'chat_scratch',
      exists: true,
      error: null,
    };
  }

  return resolveWorkspacePath();
}
