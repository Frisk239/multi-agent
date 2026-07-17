# Phase 4b 设计 — 产品补充阶段（Multica 级可运营）

> 状态：**草案（计划者产出，待用户确认后 writing-plans）** · 日期：2026-07-17  
> 前置：S12 产品硬化（Chrome + 薄 Inbox + Squad 只读 + progress）  
> 依据：Multica 源码深读（`references/deep/multica.md` + `references/repos/multica`）对照 + S01–S12 已交付  
> 定位：**把 MVP 扩成可天天用的本地产品**——后端编排/可靠性/运营面与体验同切，**不单独做前端壳**。  
> 不做云端 / Redis / 多节点；不自造 Agent loop。

---

## 0. 为什么需要「补充阶段」

S01–S11 打通四层（编排-执行-Wiki-记忆）；S12 擦亮产品 Chrome。  
对照 Multica **后端**后，仍差一个产品代际：

| 已对齐（可保留） | 相差甚远（本阶段补） | 我们反超（继续加深，不砍） |
|---|---|---|
| 多态指派、DB 行锁、Squad leader+briefing+mention | **真 Inbox 系统**、subscriber | 编译式 Wiki + AGENTS bridge |
| Backend adapter、per-agent 槽、WS、progress | **run 可恢复性**（stale/orphan/heartbeat） | MemoryProvider + pgvector + ambient/cite |
| 静态 seed Agent/Squad 能跑 FRI-11 | **Agent/Squad CRUD 运营** | 纯本地混合进程 |
| 表单建 Issue | **Quick-create / 低摩擦输入** | — |
| — | **最小 Autopilot（cron/webhook）** | — |
| — | readiness / 派生 status / Settings | — |

S12 合成 Inbox、Squad 只读、隐藏假入口 —— **正确占位**，不是终点。

---

## 1. 阶段目标（一句话）

用户能在 **不改 seed/SQL** 的前提下：配置 Agent/小队 → 一句话或看板派活 → 可靠执行与崩溃自愈 → Inbox 可处理已读/归档 →（可选）定时自动建任务；同时 Wiki/Memory 路径不被破坏。

**非目标（本阶段仍不做）：** Graphiti、多机 daemon 舰队、14 CLI、GitHub/Lark 全 channel、Redis、完整 usage 计费、固化 e2e 套件。

---

## 2. 切片策略：少而厚（3 个大厚切片）

延续 S12「执行者少、单棒工作量大」。**不**拆成十几个薄 API 切片。

| 切片 | 名称 | 厚度 | 核心交付 | 建议分支 |
|---|---|---|---|---|
| **S13** | 可靠性 + 真 Inbox | 极厚 | heartbeat/stale/orphan + `inbox_item` 落库 + subscriber + Inbox UI 换真源 | `feat/s13-reliability-inbox` |
| **S14** | 可运营队友 | 极厚 | Agent/Squad CRUD + readiness + 详情运营 Tab + Quick-create | `feat/s14-roster-ops-quickcreate` |
| **S15** | 自动化与设置 | 厚 | 最小 Autopilot（cron→issue）+ 可选 webhook + Settings 薄页 + 命令面板增强 | `feat/s15-autopilot-settings` |

可选后续（不进本阶段必达）：**S16** Issue 厚度（label/attach/parent）、usage 聚合、daemon 拆分。

```
S12（硬化）──► S13（能撑住）──► S14（能配置）──► S15（能自动）
                 │                 │                 │
                 └─ 后端可靠性      └─ 运营 CRUD       └─ 调度
                    + 通知系统         + 低摩擦输入        + 设置
```

每个切片内部仍：**计划者 1 + 执行者 2（厚棒）**，契约先行，feature 分支 → PR → 新会话审查。

---

## 3. S13 — 可靠性 + 真 Inbox（地基，最先做）

### 3.1 问题

- `agent_run` 仅五态；进程杀死后 **running 可能永卡**（无 lease/stale sweeper）。  
- Inbox 合成刷新即「未读语义丢失」；无 `issue_subscriber`，通知无归属。

### 3.2 后端（主）

| 项 | 规格（学 Multica，本地简化） |
|---|---|
| Heartbeat | `agent_run.last_heartbeat_at`；worker 执行中每 N 秒 touch |
| Stale sweeper | 定时：`running` 且 heartbeat 超时 → `failed` + error 文案 + 事件；可选 `queued` 过久告警 |
| Orphan 收尸 | server 启动：无对应 Abort/子进程的 `running` → fail |
| `inbox_item` 表 | id, workspace_id, recipient_type/id, type, severity, issue_id, title, body?, actor_*, read, archived, created_at（对齐 multica 001/012/019 精简） |
| 写入钩子 | issue 指派变更、member/agent comment（可含 mention 收件人）、run 终态（completed/failed）、（可选）status→done |
| subscriber | `issue_subscriber(issue_id, user_type, user_id, reason)`；创建/指派自动加 creator+assignee；@mention 加 member |
| API | `GET /api/inbox?filter=`；`POST :id/read`；`POST :id/archive`；`POST /read-all`（可选） |
| WS | `inbox:item` 或复用现有事件 + 前端 invalidate `['inbox']` |

**明确不做（S13）：** agent 作为 recipient 全量、跨 workspace 未读聚合、Redis。

### 3.3 前端

- `/inbox` 换真源；已读/归档操作；未读角标（侧栏）  
- 合成 id 策略废弃 → 真 UUID  
- kind：`comment` / `run_completed` / `run_failed` / `assigned`（可扩展）  
- 建议默认 **滤掉纯 status_change** 或降 severity=info

### 3.4 验收

- [ ] 杀 server 再起：卡死 running 被收尸或 stale 失败，看板不再永久 spinning  
- [ ] 评论/run 终态产生 inbox 行；刷新仍在；mark read 后角标变  
- [ ] typecheck；FRI-11 / wiki enqueue / memory 路径不回归  
- [ ] S12 合成逻辑删除或 feature-flag 掉，只保留落库路径  

### 3.5 执行者拆分（建议）

| 棒 | 内容 |
|---|---|
| impl-1 | schema + migration + heartbeat/stale/orphan + 单测/脚本 smoke |
| impl-2 | inbox 写入钩子 + API + Inbox UI + badge + handoff |

---

## 4. S14 — Agent / Squad 可运营 + Quick-create

### 4.1 问题

- Agent/Squad 基本靠 seed；用户无法「建一个小队再跑」。  
- 创建工作摩擦：必须看板填字段。

### 4.2 后端

| 项 | 规格 |
|---|---|
| Agent CRUD | POST/PATCH/DELETE（软删可选）；字段：name, runtime, concurrency, mcpServers, **instructions?** |
| Squad CRUD | POST/PATCH；leaderId, operatingProtocol, missionDirective；成员 PUT 替换列表 |
| 校验 | leader 存在；members 皆 agent；删 agent 前检查 active run / 是否 leader |
| Readiness | `GET /api/agents/:id/readiness` 或嵌在详情：CLI 是否在 PATH、concurrency 占用、最近 run |
| 派生 status（可选） | idle/working/error/offline 由 active runs + readiness 计算，不手填 |
| Quick-create | `POST /api/quick-runs`：`{ prompt, assignee: agent\|squad, title? }` → 建 issue（origin 标记可选）+ enqueue；幂等可选 client token |
| Runs 列表 | `GET /api/agents/:id/runs?limit=`（agent 维度历史） |

### 4.3 前端

- `/agents` 新建/编辑；详情 Tab：**概览 / Runs / Skills / MCP**（4 Tab，不抄满 8）  
- `/squads` 新建/编辑协议与成员（S12 只读升级）  
- 命令面板或顶栏：**快速派活**输入（调 quick-runs）  
- toast 全覆盖 mutation  

### 4.4 验收

- [ ] 空库（或清 seed 外）UI 建 Agent+Squad → 指派 → 真实/可失败 run 可追踪  
- [ ] quick-run 一条 API 产生 issue+run  
- [ ] 只读路径与 S12 样式兼容  
- [ ] typecheck + 回归看板/Inbox  

### 4.5 执行者拆分

| 棒 | 内容 |
|---|---|
| impl-1 | Agent/Squad API + schema 字段 + readiness |
| impl-2 | 运营 UI + quick-create API/UI + handoff |

---

## 5. S15 — 最小 Autopilot + Settings

### 5.1 问题

- 无定时/webhook；自动化入口 S12 已诚实隐藏。  
- 模型 key、workspace cwd、embedding/wiki LLM 状态分散在 env，产品内不可见。

### 5.2 后端（最小可用，非 Multica 全集）

| 项 | 规格 |
|---|---|
| 表 | `autopilot_trigger(id, name, kind=cron\|webhook, cron_expr?, webhook_token?, assignee_type/id, title_template, body_template, enabled)` |
| 执行日志 | `autopilot_run(id, trigger_id, planned_at, status, issue_id?, error?)` + **唯一 (trigger_id, planned_at)** |
| Worker | 主进程 tick（如 30s）：到点则 create issue + 走现有 enqueue；离线策略：本地单机直接跑 create_issue 模式 |
| Webhook | `POST /api/hooks/autopilot/:token` 校验 token → 同 dispatch 核心 |
| Settings 只读/半写 | `GET /api/settings/status`：MA_WORKSPACE_CWD、各 runtime 探测、wiki/memory provider 状态、LLM/embed 是否配置（**不回传完整密钥**） |

**不做：** multi-leader scheduler、CatchUp 全模式、GitHub app、Lark。

### 5.3 前端

- `/automation` 或 Settings 子页：trigger 列表 + 启用开关 + 最近 run  
- `/settings`：环境健康、路径、provider 状态；链到 memory/wiki  
- 侧栏重新挂「自动化」「设置」（此前 S12 隐藏）  

### 5.4 验收

- [ ] 建一条每分钟/测试 cron → 自动出现 issue 且可指派执行  
- [ ] webhook 一次 POST 幂等不双建（同 planned_at 或 delivery id）  
- [ ] Settings 页能诊断「为什么 agent 跑不起来」  
- [ ] typecheck；不引入 Redis  

### 5.5 执行者拆分

| 棒 | 内容 |
|---|---|
| impl-1 | schema + dispatch 核心 + cron tick + webhook |
| impl-2 | Automation/Settings UI + cmdk + handoff |

---

## 6. 跨切片约束（宪法级）

1. **先查 Multica 再写**：claim/inbox/autopilot 任何状态机，对照 `references/deep/multica.md` 与上游 query，结论写进 handoff「参考了 X」。  
2. **DB 行即锁**：状态转换继续 `UPDATE WHERE status IN`；新增 stale 也走条件更新。  
3. **Squad 不建 task 抽象**：继续 leader run + mention。  
4. **Inbox 写入与业务同事务或同请求顺序**：避免「issue 有了通知没有」。  
5. **Wiki/Memory 回归门禁**：每切片验收勾选 `GET /api/wiki/pages`、memory status、done→ingest enqueue。  
6. **Playwright**：探索式验收可，不落仓 e2e。  
7. **Git**：仅 feature 分支；main 只合已审 PR；文档可 `docs:` 进 main。

---

## 7. 与 roadmap / slices 的映射

| 旧 Phase 4 文案 | 新 |
|---|---|
| 「打磨 + 答辩材料」 | **Phase 4a S12** 硬化；**Phase 4b S13–S15** 可运营补充；答辩材料穿插文档不单独立项挡产品 |
| Autopilot「如时间允许」 | **S15 必达最小集** |
| slices.md S06+ 占位（收件箱/8 Tab/…） | 由 S12–S15 **消化**：Inbox→S13；Agent Tab→S14；Ctrl+K 已 S12；设置→S15 |

---

## 8. 决策记录（待用户拍板）

| 代号 | 建议默认 | 可选替代 |
|---|---|---|
| Q1 | 三厚切片 S13→S14→S15 串行 | 合并 S14+S15 成更厚一条（不推荐，会话易炸） |
| Q2 | S13 必须先于 S14（可靠性优先） | 先 CRUD 再 Inbox（演示友好但欠债） |
| Q3 | Quick-create 放 S14 | 放到 S15 与 cmdk 一起 |
| Q4 | Autopilot 仅 cron+可选 webhook | 只做 cron |
| Q5 | Agent `instructions` 字段 S14 就加 | 推迟到 S15 |
| Q6 | 补充阶段正式名 **Phase 4b** | 称 Phase 5（若想与 roadmap 月份脱钩） |

**计划者推荐：** Q1 三切片串行；Q2 可靠性优先；Q3 quick-create 在 S14；Q4 cron+webhook token；Q5 instructions 进 S14；名称 **Phase 4b**。

---

## 9. 成功画像（阶段结束时）

1. 笔记本休眠/杀进程后，任务会失败收口而非假 running。  
2. Inbox 像轻量 Linear：未读、归档、点进 Issue。  
3. 产品内建 Agent/小队，改 briefing，快速一句话派活。  
4. 至少一条 cron 自动化可演示。  
5. Settings 能解释运行失败原因。  
6. Wiki + Memory 仍是差异化主路径，FRI-11 可演示。

---

## 10. 下一步（本文件批准后）

1. 用户确认 §8 决策（或改默认）。  
2. `writing-plans` 只写 **S13** 详细计划（S14/S15 保持本 spec 级，临开切片再拆）。  
3. S12 PR 合并不阻塞 S13 开分支（S13 基于 main 含 S12）。  
4. 更新 `design/slices.md` / `design/roadmap.md` / `AGENTS.md` 完成状态（文档提交 main）。

---

## 附录 A — Multica 文件锚点（实现时打开）

| 主题 | 上游 |
|---|---|
| Claim / stale | `pkg/db/queries/agent.sql` Claim/FailStale |
| Inbox | `pkg/db/queries/inbox.sql`；`001_init` inbox_item |
| Subscriber | `subscriber.sql` |
| Squad briefing | `handler/squad_briefing.go` |
| Autopilot | `service/autopilot.go`；`scheduler/` |
| Quick create | `TaskService.EnqueueQuickCreateTask` |

## 附录 B — 我们侧锚点

| 主题 | 路径 |
|---|---|
| Run worker/claim | `app/packages/server/src/orchestration/run-worker.ts` |
| Enqueue | `run-service.ts` |
| 合成 Inbox（S12） | `routes/inbox.ts` → S13 替换 |
| Squad loader | `db/squad-loader.ts` |
| Schema | `db/schema.ts` |
