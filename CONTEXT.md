# CONTEXT.md — 领域词汇与当前方位

> 本仓 **single-context** 领域真源。由工作流 skills（`/grill-with-docs`、`/domain-modeling`）增量维护。  
> 系统架构细节仍以 `design/synthesis.md`、`AGENTS.md` 关键决策为准。

## 产品一句话

纯本地软件工程多智能体编排平台：人在 Web 控制台派任务 → Agent 驱动本机编码 CLI → 产出进 **Wiki**、经验进 **Memory**。

**产品立场：** 本仓按**真实产品**建设与演进。答辩、论文、seed 样例（如 FRI-11）可作回归锚点或并行材料，**不是**路线图与切片优先级的真源。

## 术语表（优先用这些词）

| 术语 | 含义 | 避免说成 |
|---|---|---|
| **Issue** | 看板上的工作项；可指派 agent/squad | task  alone（易与 agent_run 混） |
| **Agent** | 可指派的执行身份，绑定一种 RuntimeBackend | bot、机器人（可口语，文档用 Agent） |
| **Squad** | 以 leader agent 执行 + briefing + @mention 委派的小队 | 小组任务表、fan-out 任务 |
| **Agent Run / Run** | 一次 CLI 执行实例（`agent_run`） | job（保留给 wiki ingest job） |
| **Runtime / Backend** | 本机 CLI 适配器（claude-code / opencode / cursor…） | 自造 agent loop |
| **Wiki** | 编译式项目知识库（filesystem `wiki/` + ingest） | 仅 RAG 语料 |
| **Memory** | 可插拔记忆（MemoryProvider；sqlite-text / pgvector） | 与 Wiki 混用 |
| **Inbox** | 落库通知（inbox_item），非合成 feed | 邮件 |
| **Automation** | 定时/立即按模板建 Issue 的规则（补5） | Autopilot 全集（无 webhook 本阶段） |
| **Quick-create** | 无 Issue 先 QC run，agent 经 `ma issue create` 建卡（补3） | 与 Automation 混淆 |
| **补充阶段 / 补N** | MVP 后可运营补齐刀（bu01…），非论文创新主线 | S13+ 前推编号（已弃） |

## 架构钉死（勿在实现里推翻）

1. 不自造 Agent loop — Backend adapter 驱动已有 CLI  
2. DB 行即锁 — 条件 UPDATE，非内存状态机  
3. 多态指派 `(type, id)`  
4. Squad = leader + briefing + mention  
5. 纯本地 — 无 Redis / 多节点 / 云托管  
6. 不改 `references/repos/` 上游 clone  

## 当前方位（2026-07-17）

- **已合 main：** S01–S12；补1–5；产品演进 `run-observability`（PR #17）、`wiki-memory-ops`（PR #18）、`issue-labels`（PR #19）、`issue-find`（PR #20）  
- **补充阶段：已收官**（phase4b 退出清单勾满；**不开补6**）  
- **主线：产品演进** — 当项目/产品继续做垂直切片；主题由人按**日常使用价值**点名（非答辩清单驱动）  
- **已合 main（续）：** `issue-assignee-desk`（PR #21）、`board-priority-triage`（PR #22）  
- **上一刀 intake：** `board-priority-triage` **通过**（已合 main PR #22）— `app/.progress/board-priority-triage-intake.md`  
- **已合 / 已推 main：** `issue-detail-edit`（PR #23 / `0433bb0`）；流程简化 docs（`ecb9da4` main 直推）  
- **本刀：** `mention-dispatch-visibility` — @提及派发系统 comment + 时间线 badge（main 直推）  
- **工程简化：** 默认可 **main 直推**；见 `docs/agents/merge.md`  
- **北星：** 纯本地可用 · 体验对标 Multica；调研优先 multica  
- **迭代约束：** 每刀 Playwright 关刀；定期 Multica 短差距表  
- **再下一刀：** leader briefing / Run 状态与 mention 联动；或人点名  
- **工作流：** Slice Owner × 验上一刀 × 调研子代理 × Playwright 关刀；合码 push→CI+review→人远程合并。`AGENTS.md` · [workflow](docs/agents/workflow.md) · [merge](docs/agents/merge.md) · ADR 0001/0002  
- **工单 / 交接：** `.scratch/` · `app/.progress/*-impl|intake` · `/handoff`  


## 相关入口

| 读什么 | 路径 |
|---|---|
| 项目宪法 | `AGENTS.md` |
| 技术选型 | `design/synthesis.md` |
| 补充阶段池 | `docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md`（历史真源，仍有效） |
| Skills 配置 | `docs/agents/` |
