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

## 当前方位（2026-07-19）

- **阶段：** S01–S12 + 补1–5 已合；补充阶段收官；**主航道日用路径已可用**
- **北星：** 本地 Multica 控制台体验（非 1:1 源码克隆）— [workflow.md](docs/agents/workflow.md) · [主航道 gap](app/.progress/multica-gap-2026-07-17.md) · [真站 live gap](app/.progress/multica-gap-live-2026-07-19.md)
- **工程：** 自动迭代 Slice Owner · Playwright 关刀 · **main 直推** · [merge.md](docs/agents/merge.md)
- **最近交付：** cwd 持久化 · 健康卡 · wiki/memory 批量运维 · 宪法刷新 · `memory-bulk-delete`（`6928c78`）
- **完成审计（主航道日用）：** `app/.progress/local-multica-completion-audit-2026-07-19.md`
- **真站对照 gap（产品壳）：** `app/.progress/multica-gap-live-2026-07-19.md` — Chat/Helper、Inbox 三栏、用量、项目、Issue 作业面
- **判断：** 本地运维主航道 **可用**；与 **multica.ai 产品壳** 仍有明确体验差（见 live gap 队列 G7→G17）
- **已推：** 真站体验队列含 G1–G3/G6–G10/G12–G13/G15–G17 等（见 git log）  
- **本刀：** `issue-pr-link`（G3：详情 PR URL 引用）  
- **closeout：** `app/.progress/issue-pr-link-impl-1.md`  
- **Multica 鉴权：** `app/.progress/multica-auth/`（storage-state gitignore）  
- **再下一刀建议：** `user-profile-brief`（G18）/ `board-column-i18n`（G5）/ G14 runtime 文案  
- **历史流水：** `git log` / `app/.progress/*-impl-*.md`

## 相关入口

| 读什么 | 路径 |
|---|---|
| 项目宪法 | `AGENTS.md` |
| 技术选型 | `design/synthesis.md` |
| 差距表（主航道） | `app/.progress/multica-gap-2026-07-17.md` |
| 差距表（真站体验 2026-07-19） | `app/.progress/multica-gap-live-2026-07-19.md` |
| 补充阶段池（历史） | `docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md` |
| Skills 配置 | `docs/agents/` |
