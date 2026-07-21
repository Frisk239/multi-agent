# UX Gap Report: multi-agent vs Multica

Date: 2026-07-21  
Scope: `app/packages/server` + `app/packages/web` vs `references/repos/multica/` (daemon execenv / task service / chat / runs UI)

---

## 1. Executive summary

- 本仓已修两处硬伤：**chat 默认隔离 scratch cwd**（不再默认踩 workspace 仓根）与 **chat 硬超时 15min**（原 3min 过短）。
- 与 Multica 的结构性差距仍在：**cwd 模型只有「全局 workspace root」**，无 `project → local_directory` 资源绑定；issue/QC/squad 一律进同一根目录。
- **chat 无多轮 history 注入**（只喂当前 `quickPrompt`），与 Multica `trailingUserMessages` 差一整代产品体验。
- **issue 执行无 wall-clock / idle / tool watchdog**；仅靠 2min heartbeat stale 收尸，长工具静默会被误杀或挂死两难。
- **指派/enqueue 服务端几乎不校验 readiness**（UI 仅警告不硬拦）；`checkAndEnqueue` 返回 `null` 时静默，用户以为已开工。
- **Runs Mission Control CTA 误导**：chat 失败行无「再聊」入口；`retry` API 对无 issue 的 chat/QC 直接 400，列表却对有 issue 的行统一「再执行」。
- **Projects 无本机路径资源** → skill / AGENTS / wiki 全绑 workspace root，多项目场景上下文必错。
- **Inbox 成功 run 也推送**，完成噪声高；chat 终态甚至不进 inbox。
- 优先级建议：P0 多项目 cwd + chat 多轮；P1 issue 超时模型 + enqueue 可观测；P2 Runs/Settings/Inbox 可行动 CTA。

---

## 2. Method / sources

**本地（read-only）**

- Server: `runtime/resolve-run-cwd.ts`, `orchestration/run-worker.ts`, `stale-runs.ts`, `readiness.ts`, `run-service.ts`, `issue-create.ts`, `inbox-writer.ts`, `runtime/prompt.ts`, `routes/{chat,issues,runs,settings,projects}.ts`, `db/schema.ts`, `skill/scanner.ts`, `wiki/agents-bridge.ts`, `workspace-cwd.ts`
- Web: `components/{ChatPage,RunsPage,RunDetailPage,SettingsPage,NewIssueForm,AssigneeSelect,InboxPage,ProjectsPage,ProjectDetailPage}.tsx`

**Multica**

- Daemon: `server/internal/daemon/execenv/execenv.go` (Prepare/Reuse), `local_directory.go`, `config.go` (timeouts/watchdogs), `handler/daemon.go` (`trailingUserMessages`)
- Service: `service/task.go` (RerunIssue / prepare lease / stale reclaim), `service/agent_ready.go`
- Chat: `handler/chat.go`, chat claim workdir reuse in `handler/daemon.go`

对比原则：同轴找「用户感知坏体验」→ 本地根因 file:line → Multica 对照 file:line → 薄切片修复。

---

## 3. Ranked findings table

| # | Severity | Axis | Finding (1 行) | Demoable? |
|---|----------|------|----------------|-----------|
| F1 | **P0** | cwd | Issue/QC 无 per-project `local_directory`，一律 workspace root | Y |
| F2 | **P0** | chat | Chat prompt 无会话 history，每轮失忆 | Y |
| F3 | **P1** | timeout | Issue run 无 idle/tool/wall timeout；2min HB 与长工具冲突 | Y |
| F4 | **P1** | assignee | Enqueue 静默失败 / 不校验 readiness | Y |
| F5 | **P1** | runs CTA | Chat/无 issue 失败行 CTA 错误（再执行不可用或误导） | Y |
| F6 | **P1** | prompt | Wiki/AGENTS/skills 绑全局 cwd，错仓上下文 | 部分 |
| F7 | **P2** | settings | Health 多项只 hint、少一键动作；cwd 默认文案绑本机路径 | Y |
| F8 | **P2** | board | 指派 UI 警告但不拦；服务端仍 enqueue | Y |
| F9 | **P2** | skills | 项目 skill 目录 = 全局 workspace `.skills`，无 per-project | 中 |
| F10 | **P2** | inbox | 成功 run 全推送；chat 终态缺失；噪音与漏报并存 | Y |
| F11 | **P3** | chat product | 无会话级「绑定项目目录」；UI 空态文案仍暗示「了解工作区」 | Y |
| F12 | **P3** | rerun | Rerun 不复用 workdir/session（Multica 有 PriorWorkDir） | 中 |

