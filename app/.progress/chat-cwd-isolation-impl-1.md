# chat-cwd-isolation-impl-1

## 问题
1. Chat 硬超时默认 180s，慢 CLI 首响/工具链容易 `timeout: CLI exceeded 180000ms`。
2. Chat 与 Issue 共用 `resolveWorkspaceCwd()`（常为 multi-agent 仓根），用户未选项目时 agent 仍在该仓探索，体验困惑。

## Multica 对照
- `server/internal/daemon/execenv/execenv.go`：`Prepare` 默认 `WorkDir = {workspacesRoot}/{ws}/{taskShort}/workdir`（空隔离目录）；仅 `LocalWorkDir`（project `local_directory` resource）时才指向用户本机路径。
- Chat task 同样走 daemon claim → execenv；**不是**「在 monorepo 根目录起 CLI」。
- 本仓无 daemon / project resource 锁：chat 用 `~/.multi-agent/chat-sessions/<thread>/workdir` 近似隔离 scratch。

## 改动
| 项 | 前 | 后 |
|---|---|---|
| chat cwd | workspace root | `~/.multi-agent/chat-sessions/<threadId>/workdir` |
| issue/QC cwd | workspace root | 不变 |
| `MA_CHAT_USE_WORKSPACE_CWD=1` | — | chat 强制走工作区（调试/opt-in） |
| `MA_CHAT_TIMEOUT_MS` 默认 | 180000 (3min) | **900000 (15min)**；`0` 可关硬超时 |
| chat prompt | 泛化「勿改仓」 | 明示当前 cwd 是隔离空目录，勿探索上级/其它仓 |

## 文件
- `app/packages/server/src/runtime/resolve-run-cwd.ts`（新）
- `app/packages/server/src/orchestration/run-worker.ts`
- `app/packages/server/src/runtime/prompt.ts`

## 后续（未做）
- 会话级「选择本机目录 / 项目」UI + 写入 thread → chat 用该 path（真 Multica local_directory 体验）
- Issue 任务 per-run 隔离 workdir（更大，需资源/GC）

## 验收
- 新 chat run 的 CLI cwd 在 `~/.multi-agent/chat-sessions/...`，不再是 D:\code\multi-agent（除非 opt-in）
- 默认 15min 内不会因 3min 超时失败；仍可用 env 调
