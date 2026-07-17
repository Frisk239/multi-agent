# Intake: run-observability

> 下一 Slice Owner handoff-based 验收 · 2026-07-17  
> 上一刀：`run-observability` · 交接：`app/.progress/run-observability-impl-1.md`

## 结论

**有条件通过**

可进入下一刀短对齐 brainstorm。**无需返工**；下列债不挡产品日常路径，记入债即可。

## 合并 / 分支

| 项 | 状态 |
|---|---|
| `git fetch` | 已做 |
| `origin/main` | `72c888a`（含 `docs: next Slice Owner must intake…`） |
| 功能合入 | **已合** — `8b38584` Merge PR #17 ← `79dab5d feat: run observability…` |
| `79dab5d` 是否 ancestor of `origin/main` | 是 |
| 本会话 | **未** `git push origin main`；工作区干净除 untracked `app/packages/server/wiki/`（运行产物，勿 commit） |

## 对照交接声称

impl-1 声称：票 01–03 同会话交付；typecheck 绿；API smoke（list / rerun 201 / retry 201 + `rerunOfRunId` / QC 400 / 回归 200）；偏离无。

### 代码抽查（main 上）

- `GET /api/runs`：`issueId` 可选 + `status`/`agentId`/`kind`/`limit`（default 50, max 200）
- `POST /api/issues/:id/rerun` + `POST /api/runs/:id/retry` → 共用 `rerunIssue` / `retryRun`
- 始终新行；`cancelActiveRunsForIssueAgent` 仅同 issue+同 agent
- `rerun_of_run_id` migration `0011` + shared `AgentRun.rerunOfRunId`
- `classifyRunFailure`：`cwd_missing` / `cli_missing` / `stale_or_orphan` / `generic`
- UI：`/runs` + Sidebar/CmdK「运行」；Issue `RunStatusBar` 分类+再执行；Agent Runs 再执行；Inbox 无 issue 的 `run_failed` → `/runs`
- feat commit 无 `wiki/` / `*.db` / 密钥

### 本会话复核证据

1. **`pnpm -r typecheck`**（`app/`）：shared / web / server **全绿**  
2. **API smoke**（临时 `DB_PATH` + PORT=3037，migrate+seed，插入 failed issue/QC run）：

| 检查 | 结果 |
|---|---|
| `GET /api/runs` 无 issueId | 200，列表含 seed 失败行 |
| `GET /api/runs?status=failed` | 200 |
| `POST /api/issues/:id/rerun` `{}` | **201** 新 `queued`（`rerunOfRunId=null`，按当前指派） |
| `POST /api/runs/:id/retry`（failed+有 issue） | **201** 新行，`rerunOfRunId=run-smoke-failed-1` |
| `POST /api/runs/:id/retry`（QC `issueId=null`） | **400** 文案含「快速派活」 |
| issues / inbox / settings/status / wiki/pages / memory / automation/rules | 皆 **200** |
| `classifyRunFailure` cwd / stale / cli | 分类正确 |

3. **UI**：本会话 **未** 起完整 `pnpm dev` 做浏览器手点；以代码路径 + API 复核为准（impl 原 handoff 亦以 API smoke 为主）。

## Spec / 票抽查

| 点 | 结论 |
|---|---|
| 工作区 runs 列表 + filter | 通过 |
| 人工 rerun/retry 新行 + QC 400 | 通过 |
| 失败分类 + Settings/runtimes 链 | 通过（代码） |
| `/runs` 壳 + 导航 | 通过（代码） |
| 无 auto-retry / usage 大盘 | 范围正确 |
| 票 01–03 Status | `resolved` |
| 票 Acceptance 勾选框 | **仍为 `[ ]`**（文档债） |

## 偏离

与 spec 无未解释功能偏离（与 impl-1「无」一致）。

## 债 / 风险（不挡下一刀）

1. **票勾选未回写** — Status 已 resolved，Acceptance 仍未勾。  
2. **UI 浏览器手验** — 本 intake 未重做；人评若要可侧栏进「运行」点一次再执行。  
3. **QC 引导** — `/runs` 无 issue 行链到 `/`「去快速派活」，**未**预填 `quickPrompt`（spec 写「可预填」，非硬挡）。  
4. **运行产物** — 本地 `app/packages/server/wiki/` untracked；继续勿 commit。  
5. **Windows 临时 DB 目录** — smoke 后偶发 EPERM 删不掉 WAL；无产品影响。

## 给下一 Owner

- 上一刀 **已在 main**，不要再 push `feat/run-observability` 合码流程。  
- 下一主题：人未点名 → **提 2 个候选等人拍板**（产品日常价值）。  
- 开刀前读 `CONTEXT.md` · `AGENTS.md` §工程模式 · 本 intake。
