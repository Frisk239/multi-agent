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
- **主线：产品演进 · 自动迭代** — Owner 可按日常价值与 Multica 差距**自行选题**（人可不每刀点名；可随时否决）  
- **已合 main（续）：** `issue-assignee-desk`（PR #21）、`board-priority-triage`（PR #22）  
- **上一刀 intake：** `board-priority-triage` **通过**（已合 main PR #22）— `app/.progress/board-priority-triage-intake.md`  
- **已合 / 已推 main：** `issue-detail-edit`（PR #23 / `0433bb0`）；流程简化 docs（`ecb9da4` main 直推）  
- **已推：** `mention-dispatch-visibility`（`10f2b91`）  
- **已推：** `leader-briefing-preview`（`e0394af`）  
- **已推：** `runs-leader-badge`（`124bce3`）  
- **已推：** `runs-leader-api-nav`（`603e0e6`）  
- **已推：** `runs-url-mirror`（`9fc996a`）  
- **已推：** `inbox-run-nav`（`94ae27b`）  
- **已推：** `inbox-filter-url`（`b529e69`）  
- **已推：** `memory-search-url`（`2b51cdb`）  
- **已推：** `wiki-slug-url`（`d7bbe02`）  
- **已推：** `cmdk-wiki-memory`（`0b58387`）  
- **已推：** `cmdk-squad-settings`（`c073750`）  
- **已推：** `cmdk-agent-readiness`（`6e8dea8`）  
- **已推：** `assign-readiness-fail-diag`（`7d1c6cf`）  
- **已推：** `board-card-readiness`（`47871fb`）  
- **已推：** `board-failed-filter`（`28b414f`）  
- **已推：** `squad-readiness-summary`（`cbbcaeb`）  
- **已推：** `cmdk-failed-board`（`beb3b83`）  
- **已推：** `assign-squad-member-readiness`（`6a58b85`）  
- **已推：** `inbox-fail-strip`（`eee76ed`）  
- **已推：** `sidebar-inbox-fail-cue`（`4e8801a`）  
- **已推：** `env-cwd-banner`（`be8de2d`）  
- **已推：** `runs-failed-board-link`（`8f06822`）  
- **已推：** `board-run-active-pulse`（`5788704`）  
- **已推：** `board-failed-filter-note`（`4456f9e`）  
- **已推：** `agents-list-readiness`（`eb311e1`）  
- **已推：** `issue-live-progress`（`fc87b9c`）  
- **已推：** `settings-env-copy`（`5556177`）  
- **已推：** `board-live-trace-anchor`（`cc3ebbe`）  
- **已推：** `memory-ops-deepen`（`f0cecb5`）  
- **已推：** `wiki-health-entry`（`fdbfaf0`）  
- **上一刀 intake：** `wiki-health-entry` **通过** — `app/.progress/wiki-health-entry-intake.md`  
- **已推/本地：** `runs-active-nav`（`a3538f2`；push 曾受 GitHub 网络影响）  
- **已推：** `automation-next-run`（`bd6ec14`）  
- **已推：** `cmdk-active-runs` · `sidebar-active-chip` · `automation-template-preview`（`62c5fc8`）  
- **上一刀 intake：** `automation-template-preview` **通过**  
- **已推：** `runtimes-ops-links`（`c538523`）  
- **已推：** `skills-ops-links`（`9001467`）  
- **已推：** `label-board-links`（`d8c1d1a`）  
- **已推：** `agents-list-filters`（`d0a8001`）  
- **已推：** `squads-list-filters`（`3fe60a9`）  
- **已推：** `automation-rule-filters`（`ccebb36`）  
- **本刀：** `fail-recovery-cues` — Runs/看板失败恢复横幅与卡片深链  
- **closeout：** `app/.progress/fail-recovery-cues-impl-1.md`  
- **对照：** `app/.progress/multica-gap-2026-07-17.md`  
- **工程：** main 直推 · 自动迭代 · Playwright 关刀  
- **北星：** 纯本地 · 对标 Multica  
- **再下一刀建议：** inbox 失败内联再执行；settings↔runs 回跳  





- **工作流：** 自动迭代 Slice Owner · main 直推 · [workflow.md](docs/agents/workflow.md) · [merge.md](docs/agents/merge.md)  
- **工单 / 交接：** `.scratch/` · `app/.progress/*-impl|intake` · `/handoff`  


## 相关入口

| 读什么 | 路径 |
|---|---|
| 项目宪法 | `AGENTS.md` |
| 技术选型 | `design/synthesis.md` |
| 补充阶段池 | `docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md`（历史真源，仍有效） |
| Skills 配置 | `docs/agents/` |
