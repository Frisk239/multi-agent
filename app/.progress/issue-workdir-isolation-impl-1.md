# issue-workdir-isolation-impl-1

## 调研结论（Multica）

见 `multica-execenv-workdir-research.md`：

- 默认 cwd = `{WorkspacesRoot}/{ws}/{taskShort}/workdir` 空目录
- 仅 `local_directory` 才用用户本机路径
- 绝不用 daemon/控制台 process.cwd

## 本刀实现

| kind | cwd（默认） | opt-in 宿主项目 |
|---|---|---|
| issue | `~/.multi-agent/run-workspaces/ws-local/{issueId}/workdir` | `MA_ISSUE_USE_WORKSPACE_CWD=1` |
| quick_create（无 issue） | `.../run-{runId}/workdir` | 同上 |
| chat | `~/.multi-agent/chat-sessions/{thread}/workdir` | `MA_CHAT_USE_WORKSPACE_CWD=1` |

同 issue 后续 run **复用**同一 issue 目录（近似 Multica PriorWorkDir）。

### 文件
- `runtime/resolve-run-cwd.ts` — 全 kind 默认隔离
- `orchestration/run-worker.ts` — 传入 issueId
- `runtime/prompt.ts` / `quick-create-prompt.ts` — cwd 语义
- `orchestration/readiness.ts` — 默认不再因未配 workspace 报 `cwd_missing`

### 有意不做
- project.local_path UI
- GC / repo checkout CLI
- run 表 work_dir 列（后续可落库展示）

## 验收
1. 派 issue → CLI 实际 cwd 在 `~/.multi-agent/run-workspaces/...`，不是 `D:\code\multi-agent`
2. 未配 MA_WORKSPACE_CWD 时 agent readiness 可为 ready（runtime 在即可）
3. `MA_ISSUE_USE_WORKSPACE_CWD=1` 时仍走 Settings 工作区，且缺路径 → cwd_missing
