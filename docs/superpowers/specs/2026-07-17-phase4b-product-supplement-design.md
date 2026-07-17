# 补充阶段设计 — 产品可运营补齐（暂停前推）

> 状态：**已按用户决议改版** · 日期：2026-07-17  
> 前置：S12 已合 main（Chrome + 合成 Inbox + Squad 只读 + progress）  
> 依据：Multica 体验 + **后端**源码对照 + S01–S12 已交付  
>  
> ## 路线决议（最高优先级）
>
> 1. **现在进入补充阶段，不再前推**后续能力切片（不按旧「S13 接着 S14…」当主线往前赶创新/新层）。  
> 2. 补充阶段按 **补1、补2、补3…** 编号，**需要几刀就几刀**，不固定 3 或 6。  
> 3. **补到差不多了**（§1 成功画像大体达成 + 人判定可用），再恢复「后续切片」主线（若有）。  
> 4. 每一刀仍是垂直厚切片：后端 + UI 同切；计划者-执行者；feature 分支 → PR。  
> 5. 不做云端 / Redis / 多节点；不自造 Agent loop。

**编号说明：** 仓库内分支/handoff 可用 `feat/bu01-…`、`app/.progress/bu01-*.md`，文中称 **补1**。与历史草稿里的 S13/S14/S15 **脱钩**——那些只是能力包参考，不是「必须按序前推的主线编号」。

---

## 0. 为什么要「停下来补」

S01–S11 打通四层；S12 擦亮 Chrome。对照 Multica **后端 + 体验** 后，差的是 **可天天用的运营厚度**，不是再叠一层论文功能：

| 已对齐 | 补充阶段要补 | 已有优势（补的时候不能砸） |
|---|---|---|
| 多态指派、行锁、Squad briefing+mention | 真 Inbox + subscriber | 编译式 Wiki + AGENTS bridge |
| Backend、per-agent 槽、WS、progress | run 可恢复（stale/orphan/heartbeat） | MemoryProvider + ambient/cite |
| seed 能跑 FRI-11 | Agent/Squad **可配置运营** | 纯本地混合进程 |
| 表单建 Issue | 低摩擦派活（quick-create） | — |
| 假入口已藏 | 最小自动化 + Settings 可诊断 | — |

合成 Inbox、Squad 只读 = **占位**；补充阶段把占位换成真能力。

---

## 1. 阶段目标与「补得差不多了」的退出条件

### 1.1 目标（一句话）

不改 seed/SQL 也能：配 Agent/小队 → 看板或一句话派活 → 进程挂了任务能收口 → Inbox 可已读/归档 → 环境问题能在设置里看懂；Wiki/Memory/FRI-11 不回退。

### 1.2 退出补充阶段（再谈「后续切片」）

人可以随时加 **补N**，但默认 **同时满足** 再退出：

- [ ] 杀进程/重启后，无永久假 `running`  
- [ ] Inbox 落库，刷新不丢，可 mark read / archive  
- [ ] UI 内可建/改 Agent 与 Squad，并完成一次指派执行  
- [ ] 至少一种低摩擦创建（quick-create 或等价）  
- [ ] Settings（或等价）能显示 cwd / runtime / LLM·embed 是否就绪  
- [ ] （可选但推荐）至少一条 cron/手动触发的自动建 issue  
- [ ] Wiki pages + memory status + done→ingest 回归绿  
- [ ] **人判定：可以当本地日常工具用了**

未勾满可以继续 **补7、补8…**；勾满后**不必**为了对齐 Multica 全集而无限补。

### 1.3 本阶段明确不做（除非单独开「后续切片」）

Graphiti、多机 daemon 舰队、14 CLI、GitHub/Lark 全 channel、Redis、完整 usage 计费、仓库内固化 e2e 套件。

---

## 2. 工作方式：能力池 + 按需抽刀

**不是**预先锁死「必须正好 3 刀」。  
维护一个 **能力包池**；每一刀从池里取 **1 个主包 + 可选搭车**，做成端到端可 `pnpm dev` 的厚切片。

### 2.1 能力包池（按依赖大致排序）

| 包 ID | 名称 | 后端要点 | 前端要点 | 建议依赖 |
|---|---|---|---|---|
| **A** | Run 可靠性 | heartbeat、stale sweeper、启动 orphan 收尸 | 看板/详情不再假 spinning；失败可见 | 无 |
| **B** | 真 Inbox | `inbox_item` 表、写入钩子、read/archive API、subscriber | `/inbox` 真源、角标、已读归档 | 最好与 A 同阶段或紧随 |
| **C** | Agent 运营 | CRUD、instructions?、readiness | 列表新建/编辑；详情 Tab（概览/Runs/Skills/MCP） | 无硬依赖 |
| **D** | Squad 运营 | CRUD、成员、protocol/directive 可写 | `/squads` 从只读升级为可编辑 | C 或并行（不同表） |
| **E** | Quick-create | `POST /api/quick-runs`（建 issue+enqueue） | 命令面板/顶栏一句话派活 | C/D 有 assignee 更顺 |
| **F** | 最小 Autopilot | cron 表 + tick + 幂等；可选 webhook token | `/automation` 列表与开关 | A+B 后更稳 |
| **G** | Settings / 诊断 | `GET /api/settings/status`（不回传密钥） | `/settings` 健康页；侧栏恢复入口 | 随时可做，常与 F 搭 |
| **H** | Issue 厚度 | labels / attach 路径 / parent（可选） | 筛选与详情字段 | 退出条件非必须 |
| **I** | 观测 | run 错误聚合、简单 usage 计数 | 轻量面板 | 可选 |
| **J** | Wiki/Memory 打磨 | DLQ 可操作、失败提示、键缺失引导 | 已有页的空态/错误文案 | 可与任刀搭车回归 |

### 2.2 推荐抽刀序列（默认，可改可插）

仅作 **开工顺序建议**，不是固定长度合同：

| 刀 | 建议打包 | 一句话验收 | 建议分支 |
|---|---|---|---|
| **补1** | A + B | 任务可收尸；Inbox 真源可已读 | `feat/bu01-reliability-inbox` |
| **补2** | C + D | UI 建 Agent/小队并跑通指派 | `feat/bu02-roster-ops` |
| **补3** | E（+ cmdk） | 一句话产生 issue+run | `feat/bu03-quick-create` |
| **补4** | G | 设置页能解释「为什么跑不起来」 | `feat/bu04-settings` |
| **补5** | F | cron 或 webhook 自动建 issue | `feat/bu05-autopilot` |
| **补6+** | H / I / J 或复查缺口 | 按人感再补 | `feat/bu06-…` |

若某一刀太厚：可拆（如补1 只做 A，下一刀 B）。  
若某一刀太薄：可合并（如 E+G）。  
**停手权在人**：随时可宣布「补充阶段结束」。

### 2.3 与旧稿 S13–S15 的对照（仅迁移用）

| 旧称呼 | 现能力包 |
|---|---|
| S13 | 补1 ≈ A+B |
| S14 | 补2≈C+D，补3≈E |
| S15 | 补4≈G，补5≈F |

新会话、新分支 **只用 补N / bu0N**，避免和「前推 S 编号」混淆。

---

## 3. 能力包规格摘要

### 3.1 包 A — Run 可靠性

学 Multica lease/stale 思想，**本地单进程简化**：

- `agent_run.last_heartbeat_at`；执行中周期 touch  
- sweeper：`running` 且超时 → 条件更新 `failed` + 事件  
- 启动：无存活执行上下文的 `running` → fail  
- **不做**：多 host `SKIP LOCKED`、Redis wakeup  

### 3.2 包 B — 真 Inbox

学 `inbox_item` + `issue_subscriber`（精简列）：

- 落库；指派 / 评论 / run 终态写通知  
- `GET/read/archive`；替换 S12 合成路径  
- 默认弱化或过滤纯 `status_change` 噪音  
- **不做**：agent 全量 recipient、跨 workspace 未读复杂聚合  

### 3.3 包 C/D — Agent / Squad 运营

- CRUD API + 表单；Squad 可写 protocol/directive/members  
- readiness：CLI 是否可执行、槽占用、最近 run  
- 详情 Tab 做 **4 个够用的**，不抄 Multica 8 Tab 全集  

### 3.4 包 E — Quick-create

- `POST /api/quick-runs`：prompt + assignee → issue + enqueue  
- 命令面板或全局输入；复用现有路由，不建 chat 平台  

### 3.5 包 F — 最小 Autopilot

- 单进程 tick；`(trigger_id, planned_at)` 幂等  
- `create_issue` 模式优先（持久审计）  
- webhook 可选一种 token 入口  

### 3.6 包 G — Settings

- 只读/半写状态：cwd、runtime 探测、wiki/memory/LLM/embed 是否配置  
- **不**在 API 回传完整密钥  

---

## 4. 工程约束（每刀都遵守）

1. 先查 `references/deep/multica.md`（及 hermes 若碰记忆/tool）再定实现。  
2. DB 行即锁；Squad 不建独立 task 表。  
3. 每刀验收必勾：typecheck、相关 API smoke、**Wiki/Memory/FRI-11 不回归**。  
4. Playwright 仅手验，不落仓 e2e。  
5. `app/` 只走 feature 分支 PR；文档可 `docs:` 进 main。  
6. handoff：`app/.progress/bu0N-impl-k.md` / `bu0N-planner-k.md`。

---

## 5. 成功画像（补充阶段整体）

1. 休眠/杀进程 → 任务失败收口，不假 running。  
2. Inbox 可处理，像轻量待办流。  
3. 产品内配置队友与小队，快速派活。  
4. 设置页能诊断环境。  
5. （推荐）有一条自动化可演示。  
6. Wiki + Memory 仍是差异化，FRI-11 可演示。

---

## 6. 下一步

1. **当前：停在补充阶段规划**——不自动开「前推」类切片。  
2. 人确认默认序列（或改打包）后，对 **补1** 做 writing-plans。  
3. 补1 分支：`feat/bu01-reliability-inbox`（基于含 S12 的 main）。  
4. 每刀合 main 后更新本文件「进度」表（下方）。

### 进度（活表）

| 刀 | 状态 | 含包 | PR |
|---|---|---|---|
| 补1 | ✅ 已合 main | A+B | PR #12 → `a7195b9`；plan：`docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md` |
| 补2 | ✅ 已合 main | C+D | PR #13 → `840a6c8`；plan：`docs/superpowers/plans/2026-07-17-bu02-roster-ops.md` |
| 补3 | ✅ 已合 main | E | PR #14 → `2ccd03d`；plan：`docs/superpowers/plans/2026-07-17-bu03-quick-create.md` |
| 补4 | 🟢 计划者整刀验收通过，待合 PR | G | 分支 `feat/bu04-settings`；spec/plan 已批准 |
| 补5… | ⬜ 按需 | — | — |

---

## 附录 — Multica / 本仓锚点

| 主题 | 上游 | 本仓 |
|---|---|---|
| Claim/stale | `pkg/db/queries/agent.sql` | `orchestration/run-worker.ts` |
| Inbox | `queries/inbox.sql` | bu01 `routes/inbox.ts` + `inbox-writer.ts`（真表） |
| Squad | `squad_briefing.go` | `runtime/prompt.ts` + `squad-loader` |
| Autopilot | `service/autopilot.go` | （无） |
| Quick create | `EnqueueQuickCreateTask` | （无） |
