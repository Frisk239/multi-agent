# G6-2 Automation 派发幂等顺序修复 —— closeout（2026-08-03）

**刀名：** G6-2 Automation 派发幂等顺序修复（先占位后副作用，赢家才干活）
**Goal：** G6（后端执行与运营精细度）/ 第八波第二刀

## 现状基线（开工前核对）

- `automation-dispatch.ts` 主路径：`loadExistingRun` 预检查 → **`createIssueCore`（建卡 + enqueue 副作用）** → 插 automationRuns 占位（UNIQUE(rule_id, planned_at) 兜底）。重叠 tick（schedule + manual 并发）双双通过预检查 → 重复建卡/重复 run，输家副作用已发生（孤儿 Issue/run）。与 roadmap 基线一致（未变）。
- run_only 路径：先 `insert agentRuns`（副作用）后插 automationRuns，同样先副作用后守卫行。
- 上游锚点：multica `internal/scheduler/manager.go:95` `Run` 每 tick `runJob`：`markStaleAsFailed` → 算 plans → **`tryClaim`（DB 原子 INSERT + lease token）→ `runClaimed`（跑 Handler）**——「先占位后 Handler」语义；本仓以 `automation_run` 的 `uq_automation_run_rule_planned`（agent.sql 同款原子判定）实现占位。

## 落地改动

1. **占位态**：shared `AutomationRunStatus` + server schema `automationRuns.status` 加 `'dispatching'`（text 列无 DB CHECK，纯 TS 层；不迁移）。web `AutomationPage.tsx` 状态文案 `dispatching: '派发中'`。
2. **两阶段派发**（`automation-dispatch.ts` 重构）：
   - `insertDispatchPlaceholder()`：阶段 1 原子 INSERT 占位行（status='dispatching'）；unique conflict = **输家**（返回 null，调用方直接返回赢家行，零副作用）。
   - `finishAutomationRun()`：阶段 2 条件 UPDATE（`id + status='dispatching'` → 终态 issue_created/pending_dispatch/failed/skipped + issueId/linkedRunId/error），赢家独占写终态。
   - `preflightExistingRun()`：已有行（含占位）直接返回；**超龄占位（>60s，DISPATCH_STALE_MS）升级 failed（'派发中断（占位超龄，可能进程重启）'）**——诚实展示，不静默重发同 plannedAt。
   - `dispatchAutomationRule` 主流程：预检 → 占位 → 赢家才 validateAssignee/create_issue/run_only → finishAutomationRun；异常兜底占位不残留（failed + rethrow）。
   - `dispatchRunOnly`：失败分支全部改 `finishAutomationRun(placeholderId, ...)`；删除原 insert automationRuns 段（占位已持有）。
   - 删除 `insertTerminalRun/insertFailedRun/insertSkippedRun`（无外部引用，被占位机制取代）。
   - `lastPlannedAt` 更新移到占位成功后（学 multica claim 后更新规则指针）。

## 测试与实证（+4 用例，真实迁移 DB）

- `critical-path.integration.test.ts`：
  - **并发双 dispatch（Promise.all）→ 同一 automation_run id，只建 1 卡 + 1 run**（核心：重叠 tick 不再重复副作用）
  - **预插 dispatching 占位行 → dispatch 返回占位行、零副作用**（占位挡副作用的确定性验证）
  - **超龄占位（70s 前）→ 升级 failed（'派发中断'），不重发**
- `automation-dispatch.run-only.test.ts`：**run_only 并发 → 恰好 1 个 agent_run + 1 行 automation_run**
- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 909 + web 465 = 1495 全绿**（1491 + 4 新用例）。
- 真机冒烟：dev server POST `/api/automation/rules/:id/run-now`（E2E Cron Test Rule，create_issue 模式）→ 201 + `status=issue_created` + issueId + linkedRunId 齐全（赢家完成占位→终态全链路）。

## 决策记录

1. **DB 占位而非进程内单飞互斥**：与「DB 行即锁」宪法一致；单进程内无需内存锁，DB 占位天然覆盖多 tick/重启场景。
2. **超龄占位升级 failed 而非自动重发**：同 plannedAt 只发一次的语义保持；中断是罕见事件，诚实标记比自动补发可预期（补发由下一轮新 plannedAt 自然发生）。
3. **输家返回占位行（非轮询终态）**：调度 tick 只关心「该 plannedAt 已认领」；dispatching 是诚实中间态，UI 显示「派发中」。

## 下一刀建议

G6-3 核心模块测试补网（claude-code args 抽纯函数 + run-service enqueue 决策/熔断阈值边界 + wiki-llm 降级分支直测）——roadmap §4 第 17 行既定顺序；G6-4 sweeper 原子化 / G6-6 pi 诚实提示按 §3 价值取用。
