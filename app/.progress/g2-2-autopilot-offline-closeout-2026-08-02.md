# G2-2 Autopilot 离线语义 closeout（2026-08-02）

> Goal G2 编排闭环 · roadmap §4 队列第 7 刀（M1 次刀）。状态：**已关 ✅**

## 目标

学 multica autopilot.go:100-113 / errDispatchSkipped（:832-850）：`run_only` 离线时跳过记 `skipped`（不留死任务）；`create_issue` 离线仍允许（issue 是持久审计，稍后被 claim）。

## 设计（Slice Owner 拍板）

| 决策 | 选择 | 理由 |
|---|---|---|
| run_only 离线记什么 | **skipped**（瞬态，下次计划照常），非 failed | `automationRuns.status` 枚举早已含 `'skipped'`（schema.ts:569 + shared schema.ts:2364）但**全库无任何写入路径**——本刀补齐；UI 标签「已跳过」也已就绪 |
| 哪些路径记 skipped | dispatchRunOnly 内：readiness 不可派活（cwd_missing/runtime_missing/error）+ 竞态消失（agent 不存在）；规则级配置错误（validateAssignee：assignee 不存在/无 leader）仍 **failed** | 配置错误是持久问题需人修；离线/竞态是瞬态（multica errDispatchSkipped 语义） |
| create_issue 离线 | **移除 createIssueCore 就绪预检**（issue-create.ts:130-157 的 cwd_missing/runtime_missing/error 阻塞），保留结构检查（agent 不存在 404 / squad 无 leader 400） | 预检与 multica「create_issue 首要契约是持久审计」相悖；离线时 enqueue 天然返回 skipped → comment + inbox + UI toast（lib/api.ts:104-125 已有）+ automation run 记 `pending_dispatch` + 「Issue 已建，但未开工」原因 |
| 影响面 | 全局 create 路径（UI 新建/quick-create/automation）离线时都建卡 | 与 multica 一致（建卡不 gate 在 agent 可用性上，dispatch 才 gate）；web 已消费 enqueue skip meta 显示可行动 toast；PATCH 改派门（routes/issues.ts:700+）与 quick-runs 门不动（属 run-only 语义） |

## 改动

| 文件 | 改动 |
|---|---|
| `orchestration/automation-dispatch.ts` | `insertFailedRun` 拆出 `insertTerminalRun(status)`；新增 `insertSkippedRun`；dispatchRunOnly 4 处离线/竞态路径改记 skipped（文案「run_only 跳过（agent 离线）：…」） |
| `orchestration/issue-create.ts` | 移除就绪预检（保留 agent 存在性/无 leader 结构检查）；删无用 import |
| `orchestration/automation-dispatch.run-only.test.ts` | readiness mock（`vi.mock('./readiness.js')` + hoisted 状态）+ inbox-writer mock 补 `ensureIssueSubscriber/notifyAssigned` + client mock 补 `resolveAssigneeLabel/resolveAuthorLabel`（create 链需要）；新增 5 用例：3 种离线状态 skipped（表驱动）、readiness 竞态 skipped、create_issue 离线建卡 + pending_dispatch |

## 真机验收（dev.db + 本地 server + Playwright）

1. **run_only + agent 离线 → `skipped`**：POST /api/automation/rules（run_only，assignee=任一 agent）→ run-now → `status:"skipped"`，`error:"run_only 跳过（agent 离线）：工作区路径无效: …"`，无 linkedRunId（不落死任务）✅
2. **create_issue + agent 离线 → 仍建卡**：run-now → `status:"pending_dispatch"` + `issueId` + `error:"Issue 已建，但未开工：…"` ✅
3. **UI**：AutomationPage 规则行「最近 **已跳过**」/「最近 **待派发**」；run 表行「已跳过」pill + 原因 + 「待派发」行带 issue 链接与「重新派发」操作 ✅
4. 证据：`.playwright-cli/m1-g2-2-automation-skipped.png` + `m1-automation-runs.yml`（已跳过/待派发行）

> 真机技巧（供后续刀）：本机 4 runtime 全安装，无法用 runtime_missing 演示离线；用 `MA_ISSUE_USE_WORKSPACE_CWD=1` + 不存在路径 → cwd_missing。**注意 run-worker 的 resolveRunCwd ensureDir 会重建该路径**（执行 run 时 mkdir recursive）——确保演示期间无 run 被执行，否则路径被建回、离线态消失。另：dotenv 不覆盖显式设置的空 env；要模拟无 LLM key 需临时移走 `.env`。

## 门禁

- server 全量 726 passed（90 文件）；monorepo 全量 1253 passed（shared 103 + server 726 + web 424）；typecheck 全仓绿
- 新增 5 用例 + 既有 10 用例全绿

## 未做（后续刀）

- PATCH 指派/改派门（issues.ts:700+）仍是离线硬拒——语义属「改派 guard」非 create，未动；如需与 create 对齐可后续评估
- automation run 列表无「skipped 批量重试」一键（dead 有，skipped 靠下次计划自然重来——正是 multica 语义）
