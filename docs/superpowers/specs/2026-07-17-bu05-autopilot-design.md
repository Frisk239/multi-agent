# 补5 设计 — 最小自动化（cron + 立即执行）

> 状态：**待用户审阅 spec** · 日期：2026-07-17  
> 切片：补充阶段 **补5** / `bu05` · 建议分支：`feat/bu05-automation`  
> 前置：main 含补1–4（可靠性、Inbox、Agent/Squad、quick-create、Settings）  
> 依据：补充阶段包 **F**；Multica Autopilot（`create_issue` + 幂等 + 指派复用）；用户锁定 **B**（cron + 手动立即跑）+ **方案 1**（简化 schedule，非 crontab）  
> 计划者只出设计；实现另派。本阶段不写业务代码。

---

## 0. 摘要

用户配置**自动化规则**：按固定间隔或每日某时刻，用标题/描述模板**创建 Issue 并指派** agent|squad（走现网 enqueue）。  
列表支持 **启用/停用**、**立即执行**、查看最近执行记录。

**一句话验收：** 点「立即执行」→ 看板出现新 Issue（可带指派 run）；开启 interval 规则后，server 保持运行可再次自动建卡；同一 `planned_at` 不重复建卡。

**不做：** Webhook、run_only、完整 cron 表达式、多机调度、Redis。

---

## 1. 背景与决议

### 1.1 退出清单

「至少一条 cron/手动触发的自动建 issue」为**可选但推荐**。补1–4 已齐后，补5 补齐「平台会自己派活」的体感。

### 1.2 Multica 对齐（学精神，不抄全集）

| Multica | 本刀 |
|---|---|
| `create_issue` 优先（可离线落库） | **只做 create_issue** |
| 幂等 `(trigger_id, planned_at)` | **同样** `UNIQUE(rule_id, planned_at)` |
| squad→leader 复用指派路由 | 复用 `POST /api/issues` 同款 enqueue |
| CatchUp `latest_only` | **错过只补最近 1 个 plan** |
| webhook / run_only / 通用 JobSpec | **不做** |

### 1.3 决议表

| 代号 | 决议 |
|---|---|
| B | 触发 = **schedule + run-now**（无 webhook） |
| S1 | Schedule = **`interval_minutes` \| `daily_at`**，非 crontab 字符串 |
| M1 | 派发路径 = 建 Issue + assignee → **现网** `enqueueAgentRun` / `enqueueLeaderRun` |
| M2 | Catch-up = **latest_only** |
| M3 | 无 assignee / agent 不存在 → run **failed**，不建卡 |
| M4 | runtime 未就绪仍 **允许建卡**（issue 持久）；enqueue 后 run 失败由补1/Inbox 承接 |
| M5 | 新建规则默认 **`enabled=true`**；`interval_minutes` 最小 **5** |
| M6 | **disabled 规则仍允许 run-now**（调试友好） |
| M7 | creator = **LOCAL_MEMBER**；body 注明来源规则名 |
| M8 | `issue.origin_type` 增加 **`automation`**（+ `origin_rule_id` 或复用 origin_run 语义见 §3） |

---

## 2. 产品流程

```
用户保存 Rule(enabled, schedule, assignee, templates)
        │
        ├─ tick(30s) ──► 计算 due planned_at
        │                    │
        └─ POST run-now ──► planned_at = floor(now, 1s) 或 unique manual slot
                             │
                             ▼
              INSERT automation_run (rule_id, planned_at)  -- 冲突则 skip
                             │
                             ▼
              渲染 title/body 模板
              createIssue(assignee, origin=automation)
                             │
                             ├─ success → automation_run.success + issue_id
                             └─ fail → automation_run.failed + error
```

**用户体感：**

1. 侧栏「自动化」→ 新建规则 → 保存  
2. 点「立即执行」→ toast → 看板新卡  
3. 开启 interval 后保持 `pnpm dev`，到期再出卡  
4. 同一计划点不重复（幂等）

---

## 3. 数据模型

### 3.1 `automation_rule`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | 展示名 |
| enabled | INTEGER NOT NULL DEFAULT 1 | 0/1 |
| schedule_kind | TEXT NOT NULL | `interval_minutes` \| `daily_at` |
| interval_minutes | INTEGER NULL | 仅 interval：5 \| 15 \| 30 \| 60 |
| daily_time | TEXT NULL | 仅 daily：`HH:mm` 24h，**本地时区** |
| assignee_type | TEXT NOT NULL | `agent` \| `squad` |
| assignee_id | TEXT NOT NULL | |
| title_template | TEXT NOT NULL | 见 §5 |
| body_template | TEXT NOT NULL DEFAULT '' | |
| last_planned_at | INTEGER NULL | 上次成功 claim 的 plan 时刻 ms（可选优化） |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |

**校验（Zod + 服务端）：**

- interval：kind=interval_minutes 时 interval_minutes ∈ {5,15,30,60}，daily_time null  
- daily：kind=daily_at 时 daily_time 匹配 `/^\d{2}:\d{2}$/`，interval null  
- name/title 非空；assignee 存在（写时校验，跑时再校验）

### 3.2 `automation_run`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | |
| rule_id | TEXT NOT NULL FK CASCADE | |
| planned_at | INTEGER NOT NULL | plan 时刻 ms |
| source | TEXT NOT NULL | `schedule` \| `manual` |
| status | TEXT NOT NULL | `success` \| `failed` \| `skipped` |
| issue_id | TEXT NULL | 成功时 |
| error | TEXT NULL | |
| created_at | INTEGER NOT NULL | |

**UNIQUE(rule_id, planned_at)** — 幂等核心。

> `skipped`：可选，用于「INSERT 冲突」不暴露为错误；实现可用 catch unique → 记 skipped 或不插。推荐：**冲突则静默 return**，不刷 failed。

### 3.3 Issue 溯源

扩展现有：

- `origin_type`: `'quick_create' | 'automation' | null`  
- `origin_run_id` 对 quick_create；自动化可用：  
  - **方案 A（推荐）：** 增加 `origin_rule_id TEXT NULL`（清晰）  
  - **方案 B：** `origin_run_id` 存 `automation_run.id`（复用列，语义混）  

**锁定方案 A：** migration 加 `issue.origin_rule_id`；reshape/API 可选返回。

---

## 4. 模板

允许占位符（大小写敏感，实现简单 replace）：

| 占位符 | 含义 |
|---|---|
| `{{iso_time}}` | `new Date(plannedAt).toISOString()` |
| `{{date}}` | 本地 `YYYY-MM-DD` |
| `{{time}}` | 本地 `HH:mm` |
| `{{rule_name}}` | 规则名 |

未识别 `{{...}}` **原样保留**。  
body 自动追加一段：

```
---
由自动化规则「{name}」创建（source=schedule|manual, planned_at=...）
```

priority：固定 `none` 或 `medium`（**锁定 `medium`**，与「值得跑」语义一致）。  
status：新建 `backlog`（与现网 Create 一致）。

---

## 5. Schedule 算法

### 5.1 时区

**锁定：Node 进程本地时区**（`MA_TZ` 若存在则用，否则系统默认）。文档写明；Settings 不配时区本刀。

### 5.2 interval_minutes

- 对齐网格：`planned_at = floor(now / (n*60*1000)) * (n*60*1000)`  
- tick 时：若 `now >= planned_at` 且该 plan 尚未 success/claimed → try dispatch  
- latest_only：若落后超过一个 interval，**只尝试当前 grid 点**，不回放历史点  

### 5.3 daily_at

- 取「今天」本地 `HH:mm` 对应的 Date；若 now 已过且今日点未跑 → 跑今日点  
- 若已跑过今日点 → 等明天  
- 不回放昨天  

### 5.4 run-now

- `planned_at = Date.now()` 精确到 ms（或 floor 秒）  
- source=`manual`  
- 与 schedule 点碰撞概率低；若唯一冲突则 failed 返回「请重试」  
- **不要求** rule.enabled  

### 5.5 Tick

- `startAutomationWorker()`：`setInterval(30_000)` + 启动后可选立即 tick 一次  
- 在 `index.ts` 与 run-worker 一并启动  
- 单进程；无分布式锁（本机宪法）

---

## 6. API

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/automation/rules` | 列表，含 enabled、schedule 摘要字段 |
| POST | `/api/automation/rules` | 创建 |
| GET | `/api/automation/rules/:id` | 详情 |
| PATCH | `/api/automation/rules/:id` | 更新（含 enabled） |
| DELETE | `/api/automation/rules/:id` | 删规则（CASCADE runs） |
| POST | `/api/automation/rules/:id/run-now` | 立即派发 → `{ run, issue? }` |
| GET | `/api/automation/rules/:id/runs?limit=` | 默认 20，新→旧 |

**Shared 类型（语义）：** `AutomationRule`、`CreateAutomationRuleInput`、`UpdateAutomationRuleInput`、`AutomationRun`。

**错误：**

- 404 规则不存在  
- 400 校验失败  
- 409 run-now 幂等冲突（少见）  
- dispatch 业务失败：200/201 仍可返回 run status=failed（或 422）— **锁定：run-now 返回 201 + AutomationRun**，失败在 run.error，不 500  

---

## 7. Dispatch 核心（服务端）

```ts
async function dispatchAutomationRule(
  rule: Rule,
  plannedAt: number,
  source: 'schedule' | 'manual',
): Promise<AutomationRun>
```

1. INSERT automation_run pending/success 路径：先插 `status=success` 占坑易脏；**推荐：** 先 INSERT status 可简化为直接在事务内建 issue 再插 success，或先插 `status='running'` 再更新。  
   **锁定实现顺序：**  
   - try INSERT run(status=`success` 占位不可）→ 用 **`status='success'` 仅在 issue 建完后**；失败则 INSERT failed。  
   - 更干净：事务内 `INSERT run status=failed` 默认无；伪代码：

```
BEGIN
  INSERT run(rule_id, planned_at, source, status='success', issue_id=null) 
    ON CONFLICT DO NOTHING → if no row, return existing/skip
  // 若 SQLite 无 RETURNING 冲突，先 SELECT 再 INSERT
  create issue...
  UPDATE run SET issue_id=?, status=success
COMMIT
```

2. 校验 assignee 存在；squad 有 leader  
3. 渲染模板  
4. 调用 **内部** `createIssueFromAutomation({...})`（与 routes/issues 共享逻辑，禁止 HTTP 自调用）  
5. enqueue 失败不回滚 issue（卡已在）；run 仍 success，error 可记 warning 字段或忽略——**锁定：issue 成功即 automation_run success**；enqueue 失败打 log  

6. 可选：`notifyInbox` 一条 info「自动化建卡 FRI-x」— **Should，非 Must**

---

## 8. 前端

### 8.1 路由与导航

- `/automation`  
- 侧栏 config 或 workspace：**自动化**（icon 已有 `automation`）  
- Ctrl+K：「自动化」  

### 8.2 页面

- 列表：name、schedule 文案（每 15 分钟 / 每天 09:00）、assignee 标签、enabled 开关、上次 run 状态、**立即执行**  
- 空态：引导创建第一条规则  
- 新建/编辑表单（页内或简单 panel）：字段对齐 §3.1  
- 规则详情可选：最近 runs 表（issue 链接、error）  

### 8.3 交互

- run-now：loading + toast 成功 identifier / 失败 error  
- enabled 开关：PATCH 乐观或等待  
- 无 webhook UI  

---

## 9. 非目标

- Webhook / 外部 HMAC  
- crontab 五段式  
- run_only / 无 Issue 直接 agent_run  
- every_plan 补跑  
- 多时区产品配置  
- 固化 e2e  

---

## 10. 执行拆分（预告）

| 棒 | 内容 |
|---|---|
| **impl-1** | migration、shared、dispatch、tick、CRUD+run-now API、smoke |
| **impl-2** | `/automation` UI、导航、回归 handoff |

分支：`feat/bu05-automation`。

---

## 11. 验收清单

- [ ] run-now → 新 Issue + automation_run success + 可指派 enqueue  
- [ ] 同一 planned_at 不重复成功建卡  
- [ ] interval/daily 字段校验  
- [ ] disabled 规则：schedule 不跑，run-now 仍可  
- [ ] assignee 非法 → run failed  
- [ ] `/automation` + 侧栏 + CmdK  
- [ ] typecheck；issues/wiki/memory/inbox/settings 回归 200  
- [ ] 无 wiki/db 误提交  

### 演示剧本

1. 建规则：每 5 分钟，指派 seed agent，标题 `巡检 {{date}} {{time}}`  
2. 立即执行 → FRI-x 出现  
3. 再立即执行 → FRI-x+1  
4. enabled=false 后仅手动可跑  

---

## 12. 修订记录

| 日期 | 内容 |
|---|---|
| 2026-07-17 | 评估通过；B + 方案 1；成文 |
