# CONTEXT.md — 领域词汇与当前方位

> 本仓 **single-context** 领域真源。由工作流 skills（`/grill-with-docs`、`/domain-modeling`）增量维护。  
> 系统架构细节仍以 `design/synthesis.md`、`AGENTS.md` 关键决策为准。

## 产品一句话

纯本地软件工程多智能体编排平台：人在 Web 控制台派任务 → Agent 驱动本机编码 CLI → 产出进 **Wiki**、经验进 **Memory**。

**产品立场：** 本仓按**真实产品**建设与演进。答辩、论文、seed 样例（如 FRI-11）可作回归锚点或并行材料，**不是**路线图与切片优先级的真源。

**目标定位：** **复刻本地版 Multica 控制台体验**（派活、小队、run 观测/恢复、Wiki/Memory、Settings），**不是** Multica daemon/云协议 1:1。

## 术语表（优先用这些词）

| 术语 | 含义 | 避免说成 |
|---|---|---|
| **Issue** | 看板上的工作项；可指派 agent/squad | task alone（易与 agent_run 混） |
| **Agent** | 可指派的执行身份，绑定一种 RuntimeBackend | bot、机器人（可口语，文档用 Agent） |
| **Squad** | 以 leader agent 执行 + briefing + @mention 委派的小队 | 小组任务表、fan-out 任务 |
| **Agent Run / Run** | 一次 CLI 执行实例（`agent_run`） | job（保留给 wiki ingest job） |
| **Runtime / Backend** | 本机 CLI 适配器（claude-code / opencode / cursor…） | 自造 agent loop |
| **Wiki** | 编译式项目知识库（filesystem `wiki/` + ingest） | 仅 RAG 语料 |
| **Memory** | 可插拔记忆（MemoryProvider；sqlite-text / pgvector） | 与 Wiki 混用 |
| **Inbox** | 落库通知（inbox_item），非合成 feed | 邮件 |
| **Automation** | 定时/立即按模板建 Issue 的规则（补5） | Autopilot 全集（无 webhook） |
| **Quick-create** | 无 Issue 先 QC run，agent 经 `ma issue create` 建卡（补3） | 与 Automation 混淆 |
| **补充阶段 / 补N** | MVP 后可运营补齐刀（bu01…），非论文创新主线 | S13+ 前推编号（已弃） |
| **Workspace cwd** | 工作区根路径：`env MA_WORKSPACE_CWD` 覆盖 `workspace.root_path`（ADR 0003） | 「只能 export 才能跑」 |
| **Run Health** | Settings/运行页：在途计数、心跳/排队收尸阈值、近收尸风险 | 仅看 failed 列表 |

## 架构钉死（勿在实现里推翻）

1. 不自造 Agent loop — Backend adapter 驱动已有 CLI  
2. DB 行即锁 — 条件 UPDATE，非内存状态机  
3. 多态指派 `(type, id)`  
4. Squad = leader + briefing + mention  
5. 纯本地 — 无 Redis / 多节点 / 云托管  
6. 不改 `references/repos/` 上游 clone  
7. 工作区路径可 DB 持久化；**密钥不落库**（ADR 0003）  

## 完成边界（本地 Multica）

**要：** 看板派活、小队、run 观测/收尸/批量取消、Wiki/Memory 运维、Settings 诊断与 cwd 保存、Inbox 失败闭环——**天天用**。  
**不要：** 云 webhook、多节点 daemon 协议 1:1、密钥写入 DB/UI、为答辩单独排期。

## 当前方位（2026-08-02）

- **路线/目标真源：** [design/roadmap.md](design/roadmap.md)（G1–G5 Goal 体系 + 切片队列）——迭代走 goal 模式（`/goal` 定义目标，引用 G1–G5）+ Slice Owner。
- **最新关刀（08-01 两波）：** [optimization-wave-closeout-2026-08-01.md](app/.progress/optimization-wave-closeout-2026-08-01.md)（W4→W2→W3→W5→W6→W7→P2 尾巴，14 commit）· [hard-gap-close-wave-closeout-2026-08-01.md](app/.progress/hard-gap-close-wave-closeout-2026-08-01.md)（F1–F4 + 小修包）· 同组 [reopenable-db-closeout](app/.progress/reopenable-db-closeout-2026-08-01.md)（D1–D5 已关；Wiki 换入未做 = 现 G5-3）· [comment-routing-closeout](app/.progress/comment-routing-closeout-2026-08-01.md)（B3 escalation fallback 刻意不做，改走 G2-1 惰性升级）。
- **已关（勿重开）：** reopenable-db D1–D5、W1–W7、O1/O2/O5/O6/O7、P2-1–P2-4（改派 lineage）、契约/故障注入测试、Banner 队列、F6 列表页 IA、cwd 解析统一。
- **▶ 下一刀默认（roadmap §4）：** **G1-1 Pi runtime 真机验收 + RPC 命令面扩展**（closeout 钦定「最值得下一刀」）→ **G2-1 Deferred-escalation**（惰性升级，复用 `escalated_from_run_id`）。已关：**G3-1 错误态三件套**（[closeout](app/.progress/g3-1-error-states-closeout-2026-08-02.md)）。
- **2026-08-02 分析（本路线生成依据）：** 三份子代理分析（后端薄弱点 / 前端交互缺口 / 对照 references 新发现）+ 规划文档未做项清单，全部纳入 roadmap G1–G5 按价值排序。

- **阶段：** S01–S12 + 补1–5 + Phase A–F + 优化波 **全部已关** · **▶ 现行：Goal 体系（G1–G5）驱动**
- **北星：** 本地 Multica 控制台体验（非 1:1 源码克隆）— [workflow.md](docs/agents/workflow.md) · [roadmap.md](design/roadmap.md)
- **工程：** goal 模式（`/goal`）+ 自动迭代 Slice Owner · Playwright CLI 关刀 · **main 直推** · [merge.md](docs/agents/merge.md)
- **近期 closeout（08-01）：** [optimization-wave](app/.progress/optimization-wave-closeout-2026-08-01.md) · [hard-gap-close-wave](app/.progress/hard-gap-close-wave-closeout-2026-08-01.md) · [reopenable-db](app/.progress/reopenable-db-closeout-2026-08-01.md) · [f6-data-surface](app/.progress/f6-data-surface-closeout-2026-08-01.md) · [comment-routing](app/.progress/comment-routing-closeout-2026-08-01.md) · [pi-backend-f6](app/.progress/pi-backend-f6-closeout-2026-08-01.md)
- **历史全量 gap（参考）：** [gap-analysis-full-2026-07-26.md](app/.progress/gap-analysis-full-2026-07-26.md) · 未做项已并入 roadmap §3

- **刻意不做（详见 roadmap §5）：** 云 webhook / daemon 1:1 / 密钥入库 / 大规模 BI / Redis 房间 / TipTap 全量 / Wiki 图谱大屏 / Deferred 默认强制改派 / 后端强制 storyline merge API
- **历史流水：** `git log` / `app/.progress/*-impl-*.md`

## 相关入口

| 读什么 | 路径 |
|---|---|
| 项目宪法 | `AGENTS.md` |
| **路线 + 目标 + 切片队列（现行真源）** | `design/roadmap.md` |
| 历史切片档案 | `design/slices.md` |
| 技术选型 | `design/synthesis.md` |
| 差距表（主航道） | `app/.progress/multica-gap-2026-07-17.md` |
| 差距表（真站体验 2026-07-19） | `app/.progress/multica-gap-live-2026-07-19.md` |
| 补充阶段池（历史） | `docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md` |
| Skills 配置 | `docs/agents/` |
