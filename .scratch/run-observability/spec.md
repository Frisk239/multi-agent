# Spec: 运行可观测与人工再执行（产品演进）

**Status:** ready-for-agent  
**Feature slug:** `run-observability`  
**Suggested branch:** `feat/run-observability`  
**Role flow:** 计划者已 grill 收口 → 本 spec → tickets → 执行者 `/implement`  

**Product north star:** [AGENTS.md](../../AGENTS.md) · [CONTEXT.md](../../CONTEXT.md) · [design/roadmap.md](../../design/roadmap.md) Phase 5+  
**Phase4b:** 补充阶段已收官，本刀**不是**补6，是产品演进第一刀。

**Reference (Multica):**  
- Manual: `RerunIssue` + optional `task_id` → new queued row, `force_fresh_session` 语义（人工不续毒会话）  
- System auto-retry / `CreateRetryTask` / `max_attempts` / session resume：**本刀不做**  
- Presence snapshot 思想：`GET /api/agent-task-snapshot`（active + per-agent latest outcome）— 本仓用放宽后的 runs 列表 + `/runs` 壳近似「能看见」  
- Sidebar：**无**一级 Tasks；本仓 **有意分叉** 增加 `/runs` 浏览壳  

---

## Problem Statement

用户把任务派给 Agent 后，失败信息散落在 Inbox 碎片和 Issue 详情里的短 error 上：

1. **看不见全貌** — 无法按 failed/active 扫一眼「现在机器上挂了什么」；`GET /api/runs` 还强制 `issueId`，没有工作区级列表。  
2. **看不懂** — raw `error` 字符串（如未配置 `MA_WORKSPACE_CWD`）不指向下一步；Settings 已能诊断环境，但 Run 失败面没有接上。  
3. **不能接着干** — 只有 cancel / 改指派间接触发 enqueue；没有明确的「再执行」。用户不知道该重派 Issue 还是重点某次历史 run。

结果是：产品能跑，但**失败后的运营体验**还不够像可天天托付的本地编排台。

## Solution

做一刀厚垂直切片：**运行可观测 + 人工再执行（R3，学 Multica 收口）**。

用户路径：

1. 打开 **运行**（`/runs`）或 Issue 详情 / Agent Runs，看到 active 与 failed。  
2. 失败行展示 **可行动分类**（cwd / CLI / stale·orphan / 通用）并链到 Settings（或相关页）。  
3. 点 **再执行**：  
   - **Issue 级**：按当前 assignee（agent 或 squad leader）enqueue **新** run；  
   - **Run 级**：按该历史 run 的 agent（及 leader/squad  provenance 若有）enqueue **新** run（须 `issueId` 匹配）；  
4. 旧 run 保持 terminal 历史；**不**把旧行改回 `queued`。  
5. `quick_create` 且 **`issueId == null`**：不提供 Rerun 语义；retry API **400**；UI 引导再快速派活（可预填 `quickPrompt`）。

## User Stories

1. As a local operator, I want a workspace-level list of active runs, so that I know what is executing now.  
2. As a local operator, I want to filter runs by `failed` (and optionally agent/kind), so that I can focus on breakage.  
3. As a local operator, I want a `/runs` page in the app chrome, so that observability is one click from the sidebar.  
4. As a local operator, I want failed runs to show a human-readable failure category, so that I know whether to fix cwd, install a CLI, or just retry.  
5. As a local operator, I want a link from a failure into Settings (or the relevant diagnostic), so that I can fix the environment without guessing env var names.  
6. As a local operator, I want to re-run an Issue after a failure without changing assignee, so that I can recover after fixing the environment.  
7. As a local operator, I want to re-run a specific past run’s agent even if the Issue assignee changed, so that mention/history rows still make sense (Multica `task_id` behaviour).  
8. As a local operator, I want re-run to always create a **new** AgentRun row, so that history stays auditable.  
9. As a local operator, I want re-run to be refused (or clearly disabled) while a conflicting active work run already exists for that issue/agent policy, so that I do not double-fire blindly (reuse existing enqueue dedupe rules).  
10. As a local operator, I want Issue detail failure UI to show full error text + actions (copy / open Settings / re-run), so that I do not depend only on Inbox.  
11. As a local operator, I want Inbox `run_failed` items to deep-link into the Issue or run context, so that notifications are actionable.  
12. As a local operator, I want Agent detail Runs to remain readable for failures and offer re-run when the run has an Issue, so that agent-centric ops still works.  
13. As a local operator, I want quick_create failures without an Issue to tell me to use Quick-create again, so that I am not offered a broken RerunIssue path.  
14. As a local operator, I want cancelled runs to be re-runnable the same way as failed runs when product-appropriate, so that I can recover from intentional stops.  
15. As a local operator, I want CmdK / sidebar to reach **运行**, so that discovery matches Automation/Settings.  
16. As a developer agent, I want HTTP contracts in shared Zod, so that web and server stay aligned.  
17. As a developer agent, I want a single orchestration entry for manual re-run, so that Issue and Run HTTP handlers do not fork business rules.  
18. As a planner, I want Multica divergences documented in this spec, so that future slices do not re-litigate auto-retry vs manual rerun.  
19. As a local operator, I want typecheck and API smoke to stay green for issues/wiki/memory/settings/inbox, so that this slice does not regress the product.  
20. As a local operator, I want FRI-11 seed and existing assign→enqueue behaviour untouched except for additive APIs/UI, so that core workflow remains stable.

## Implementation Decisions

### Seams（测试与实现优先贴合这些面）

| Seam | 角色 | 说明 |
|---|---|---|
| **S1 HTTP runs list** | 主外缝 | `GET /api/runs` 查询契约（可选 `issueId`、`status`、`agentId`、`kind`、`limit`） |
| **S2 HTTP manual rerun** | 主外缝 | `POST /api/issues/:id/rerun`、`POST /api/runs/:id/retry` → 新 `AgentRun` |
| **S3 Orchestration core** | 内缝（尽量单一） | 如 `rerunIssue({ issueId, sourceRunId? })` / `retryRun(runId)`：解析 agent、enqueue 新行、应用现有 cancel/dedupe 策略 |
| **S4 Failure classify** | 纯函数缝 | `error` 字符串 → `{ code, title, hint, settingsHref? }`；无 DB |
| **S5 UI product path** | 验收缝 | `/runs` + Issue 失败行动 +（可选）Playwright 手验，不落仓 e2e 套件 |

优先测 **S1/S2**（curl/API smoke）；S4 可单测；少造新抽象。

### API

1. **`GET /api/runs`**  
   - `issueId` **可选**（破坏性变更相对今日 400：兼容「有 issueId 只查该 issue」）。  
   - 可选：`status`（单值或约定多值）、`agentId`、`kind`、`limit`（默认合理上限，防全表拖死）。  
   - 排序：新→旧（`createdAt` desc）。  
   - 返回 `AgentRun[]`（可后续包一层 `{ items }`；若改 envelope 须 shared 同步，**优先保持数组**以减少 web churn，除非已有列表统一 envelope）。

2. **`POST /api/issues/:issueId/rerun`**  
   - Body 可选：`{ runId?: string }`（Multica `task_id`）。  
   - 无 `runId`：当前 Issue assignee → agent 或 squad leader（与现 enqueue 一致）；无 assignee → 4xx。  
   - 有 `runId`：load run；必须 `run.issueId === issueId`；用该 run 的 `agentId` / `isLeader` / `squadId` 再 enqueue。  
   - 成功：201 + 新 `AgentRun`（`status=queued`）。  
   - 人工再跑：**不**做 session resume；本仓无 session 列则仅新行 enqueue 即可。

3. **`POST /api/runs/:runId/retry`**  
   - 仅 `failed` | `cancelled`（若产品要允许 `completed` 再跑，**默认不做**，保持与「失败恢复」叙事一致；completed 用 Issue rerun）。  
   - `issueId == null`（典型 QC）：**400** + 稳定 error 文案（引导 quick-create）。  
   - 否则委托与 `issues/:id/rerun` + `runId` 同一核心。

4. **血缘（可选增强，非挡板）**  
   - 若加列：`rerunOfRunId`（学 Multica `rerun_of_task_id`）利于审计；**可本刀做 migration**，或 ticket 标明「若过厚则二期」。推荐：**有则更好，但可用 comment/system 事件兜底**。计划者倾向：**尽量加可空列**，与 Multica 报告分列一致。

### Orchestration

- 复用 `enqueueAgentRun` / `enqueueLeaderRun` / 现有 active 去重与 cancel 策略；**不要**复活旧 run。  
- Run 级 retry：仅 cancel **同 issue + 同 agent** 的 active 工作 run（学 Multica 不误杀其他 agent），再 enqueue——与「整 issue 改指派 cancel 全部」区分时以 Multica 为优先。  
- Issue 级 rerun（无 runId）：对**目标 agent** 同样避免误杀其他 agent 的 active runs。

### Failure classification（轻量）

至少识别：

| code | 信号（例） | 行动 |
|---|---|---|
| `cwd_missing` | `MA_WORKSPACE_CWD` | Settings |
| `cli_missing` | CLI 未安装 / runtime missing | Settings / 运行时 |
| `stale_or_orphan` | `stale:` / `orphan:` 前缀 | 再执行 + 说明进程曾中断 |
| `generic` | 其他 | 展示 raw error + 复制 |

不引入 Multica 全量 `failure_reason` 枚举体系；可在 `error` 上解析，不必先改写入路径（若写入侧已有稳定前缀则用之）。

### UI

- Sidebar 工作区：**运行** → `/runs`；CmdK 同入口。  
- `/runs`：表格/列表 status、agent、issue 链接、kind、error 摘要、分类 hint、再执行（有 issue）、QC 无 issue 显示「去快速派活」。  
- Issue：`RunStatusBar` / `RunTrace` / 失败条：全量 error、分类、再执行、复制。  
- Inbox：`run_failed` → issue 或说明无 issue。  
- Agent 详情 Runs：失败可读 + 有 issue 可 retry。

### Shared / 导航

- Zod：query schema、`RerunIssueInput`、必要时 `AgentRun.rerunOfRunId`。  
- 不回传密钥；Settings 链接只读诊断已有。

### Git / 工作流

- 分支 `feat/run-observability`；禁止 push main。  
- 约 2–3 张串行票：API/编排 → UI → 回归手验。  
- 勿 commit `wiki/`、`*.db`、`.playwright-cli/`。

## Testing Decisions

- **好测试：** 只断言 HTTP/可观察行为（状态码、新 run id ≠ 旧 id、issueId 约束、QC 400），不绑私有函数名。  
- **优先：** server API smoke（migrate/seed 临时 DB）：list 无 issueId、filter failed、rerun issue、retry run、QC retry 400、错误归属校验。  
- **classify：** 纯函数表驱动（可选同票）。  
- **回归：** issues / inbox / settings/status / wiki/pages / memory / automation/rules 仍 200。  
- **UI：** 手验或 playwright-cli；**不**落仓 e2e 套件（AGENTS 约束）。  
- **先验：** 现有 cancel / enqueue 单测或 smoke 风格与 `run-service` 周边一致则跟随。

## Out of Scope

- 系统 **auto-retry**、`max_attempts`、session/work_dir resume  
- Usage 计量大盘 / 图表（Multica Usage 页级）  
- Issue labels / parent / attachments  
- Wiki DLQ UI、webhook 自动化  
- Redis / 多节点 / 云托管  
- 把 Inbox 改成 runs 中心  
- 对 `completed` 成功 run 的默认 retry（除非后续产品明确要「再跑一遍成功任务」）

## Further Notes

### Multica 对齐 vs 本仓分叉

| 点 | Multica | 本仓本刀 |
|---|---|---|
| 人工再跑 | `POST /issues/{id}/rerun` + optional `task_id` | 同左（`runId`）+ `POST /runs/:id/retry` 糖 |
| 新行 | 是 | 是 |
| Auto-retry | 基础设施 failure_reason | **不做** |
| 全局一级「运行」导航 | **无** | **有 `/runs` 壳**（分叉，产品需要「看见」） |
| Workspace snapshot | active + latest outcome / agent | 用 list API + UI 筛选逼近；不强制 1:1 SQL |
| QC 无 issue rerun | RerunIssue 不可用 | **400 + 快速派活** |

### 验收画像（人 / 计划者）

1. `pnpm` typecheck 绿。  
2. 无 `issueId` 的 runs 列表能看到 seed/新失败。  
3. 制造 cwd 缺失失败 → 分类指向 Settings → 修复叙事成立（哪怕本机仍无 cwd，文案对）。  
4. Issue rerun 与 run retry 各至少一次 → 新 queued/running/failed 行出现。  
5. QC 无 issue retry → 400 与 UI 引导。  
6. Inbox / Wiki / Memory / Settings 不回归。

### Comments

- 计划者会话已确认：B2 + Multica R3 收口 + 选项 **2**（`/runs` 壳 + Q2）。  
- 执行者开工前读本 spec + `issues/0N-*.md` + `AGENTS.md` + `CONTEXT.md`。
