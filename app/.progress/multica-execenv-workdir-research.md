# Multica 工作目录隔离调研 — 2026-07-21

## 结论（一句话）

**Multica 接到 issue/task 后，默认在 daemon 的 workspaces root 下为该 task 创建隔离空目录当 CLI cwd；绝不使用控制台进程的 `process.cwd()`，也绝不默认把 monorepo/控制台源码仓当工作区。**  
只有 project 绑了 **`local_directory`** 本机路径时，才把 `WorkDir` 指到用户指定的绝对路径。

## Multica 路径布局

```
{WorkspacesRoot}/                    # 默认 ~/multica_workspaces（可 MULTICA_WORKSPACES_ROOT）
  {workspaceId}/
    {taskId前8位}/                   # envRoot = PredictRootDir
      workdir/                       # ← 默认 CLI Cwd（空目录，无仓库）
      output/
      logs/
      … provider 私有目录（codex-home 等）
```

证据：

- `execenv.Prepare`：`envRoot := filepath.Join(WorkspacesRoot, WorkspaceID, shortID(TaskID))`，默认 `workDir := filepath.Join(envRoot, "workdir")`；注释写明 **The workdir starts empty (no repo checkouts)**，agent 需要时用 `multica repo checkout`（`execenv.go` L247–294）。
- Daemon `runTask`：先 `localDirectoryAssignmentForTask`；有则 `prepParams.LocalWorkDir = localAssignment.AbsPath`，否则 `Prepare` 走空 workdir（`daemon.go` ~L4136–4260）。
- **Reuse**：同 issue 后续 task 可 `Reuse` prior workdir（需 managed-env provenance；local_directory 故意不走 reuse 以免丢 envRoot）（`daemon.go` reuse 分支 + leader_workdir_reuse_test）。
- UI：transcript 展示 `relative_work_dir`，避免泄漏 home 绝对路径（`agent-transcript-dialog.tsx`）。
- 超时哲学：默认 **无 wall-clock cap**（`DefaultAgentTimeout = 0`），靠 idle/tool watchdog（`config.go`），与本仓「仅 chat 硬超时」不同。

## local_directory 例外

- 类型：`project_resource` `resource_type = local_directory`，ref 含 `local_path` + `daemon_id`（`local_directory.go`）。
- Leader task **不绑** local_directory（协调者不占用户仓库锁）。
- 校验：绝对路径、单 daemon 单 path、path mutex 串行写。
- Prepare 时 `LocalDirectory=true`，sidecar 可 Cleanup 回滚注入文件，**不删用户目录**。

## 与本仓对比（调研时）

| | Multica | 本仓（修前/现状） |
|---|---|---|
| Issue cwd 默认 | `~/multica_workspaces/.../workdir` 空隔离 | **全局 `workspace.root_path` / MA_WORKSPACE_CWD**（常为 multi-agent 仓） |
| Chat cwd | 同 execenv 体系 | 已修：`~/.multi-agent/chat-sessions/...` |
| 用户本机项目 | 显式 local_directory | 无 project.local_path；workspace 兼作「唯一项目根」 |
| process.cwd | 不参与 agent Cwd | wiki/AGENTS 仍可能 fallback `process.cwd()` |
| 同 issue 复用 workdir | PriorWorkDir + provenance | 无 |

**产品含义：** 本仓「工作区路径」被当成 Multica 的 local_directory，但 UI/语义又像「安装目录/控制台根」，导致 **未选项目却在 monorepo 里跑 issue**。

## 本仓应对原则（拍板）

1. **默认隔离**：issue / quick_create / chat 的 CLI cwd **均不得**默认为控制台仓或 `process.cwd()`。
2. **Issue 隔离布局**（学 Multica，本地化命名）：  
   `~/.multi-agent/run-workspaces/{workspaceId}/{issueId|runId}/workdir`  
   - 有 issueId：按 issue 稳定路径（同 issue 后续 run 复用，近似 PriorWorkDir）  
   - 无 issueId（QC 早期）：按 runId  
3. **显式宿主项目（opt-in）**：`MA_ISSUE_USE_WORKSPACE_CWD=1` 或未来 `project.local_path` → 才用用户配置的本机目录。
4. **Readiness**：执行能力不应再等价于「配置了 monorepo 当 cwd」；隔离模式可 ready；workspace 仍服务 wiki/skills 扫描。
5. **Prompt**：写明实际 cwd + 隔离空目录语义；去掉含糊的 “current workspace”。

## 非目标

- 不移植完整 daemon GC / path mutex / repo cache  
- 不实现 `multica repo checkout` CLI（后续可薄包装 git clone）  
- 不 1:1 `waiting_local_directory` 状态机  

## 实现跟踪

见同日代码改动：`resolve-run-cwd.ts` + readiness + prompt + progress `issue-workdir-isolation-impl-1.md`。
