# 后端 / 前端提升点 · 多代理分析（2026-07-30）

> **方法:** 4 个探索子代理并行——后端 vs Multica · 前端 UX · 参考仓灵感 · 健壮性盘点  
> **北星:** 本地 Multica 控制台体验；非 daemon/云/Redis 1:1  
> **前置:** [multica-gap-2026-07-17.md](./multica-gap-2026-07-17.md) · [gap-analysis-full-2026-07-26.md](./gap-analysis-full-2026-07-26.md) · [phase-g-plan-2026-07-29.md](./phase-g-plan-2026-07-29.md)  
> **注意:** 7/26 全量表中大量 F/B 项已在 7/27–7/30 关刀；本报告按 **当前代码树** 重判。

---

## 0. 一句话全景

主航道（派活 → 执行 → 观测 → 失败恢复 → Wiki/Memory → Settings）**日用可用**。  
剩余差距是 **深度、一致性、二阶手感、运维纵深**，不是缺骨架。  
本仓已有多项 **相对 Multica 的超车**（编译式 Wiki、显式 Memory、Settings 健康卡、Runs 收尸/批量取消、CmdK 运维深链）。

---

## 1. 后端功能 · 可提升点

### 1.1 短结论

- 编排/执行/收尸/auto-retry/Automation/灾备 stage/可观测投影 **骨架齐全**（含 7/30 多刀）。
- 差距在 **能力均衡与读模型统一**，不在「再造 daemon」。
- 最高 ROI：读投影统一、非 Claude resume、ops path-lock 可见、项目 Wiki 入备份。

### 1.2 产品债（A）

| ID | 提升点 | 现状 | 参考 | 价值 | 难度 |
|---|---|---|---|---|---|
| **A1** | **Session resume 跨 CLI 均衡** | 仅 `claude-code` `supportsSessionResume=true`；opencode/cursor 可解析 session 但不注入 | Multica `opencode.go` `--session`、`cursor.go` `--resume` | 高 | 中 |
| **A2** | **统一读投影 decorateRunForRead** | 部分 GET 用 `toObservedAgentRun`；chat/quick/WS 内部仍混 `toAgentRun` | Multica failure/elapsed 视图分离 | 高 | 低–中 |
| **A3** | **Ops 队列 sample 暴露 path-lock holder** | path-lock enrich 有，ops DTO 可能缺 holder | Multica waiting/lease reason | 中–高 | 低 |
| **A4** | **灾备含项目级 Wiki** | manifest 强制 `projectScopedExcluded` | 本仓产品缺口 | 高 | 中 |
| **A5** | **Automation `run_only` 薄模式** | 仅 create_issue + enqueue | Multica autopilot `run_only` vs `create_issue` | 中 | 中 |
| **A6** | **Pi 真执行或产品隐藏** | 诚实 `executionImplemented=false` | Multica `pi.go` | 中 | 高 / 低（隐藏） |
| **A7** | **inline transcript preview API** | messages 已有；Issue/Squad 仅深链 | execution-log closeout 残留 | 中 | 低–中 |
| **A8** | **子代理树 DTO 带 terminalReason** | tree API 有，字段不全 | Multica 父子 task 血缘 | 中 | 低 |
| **A9** | **Grok 完整 ACP / 能力诚实** | print 优先，ACP 注释未完整 | 本仓 runtime | 中 | 高 |

### 1.3 健壮性债（B）

| ID | 主题 | 说明 |
|---|---|---|
| **B1** | auto-retry 与 queue age 语义 | `retry_backoff` 期间勿误报 at-risk |
| **B2** | live restore 闸门 | stage 已安全；live swap 需 quiesce + rollback journal + 人工确认 |
| **B3** | 路由层契约测试 | issues/runs/chat/automation/memory/wiki HTTP 层薄；orchestration 逻辑厚 |
| **B4** | run-worker / run-service 直测 | 业务核心，故障注入不足 |
| **B5** | 失败分类精度 | provider_network vs auth/quota 边界影响 auto-retry |
| **B6** | Memory/Wiki 降级可观测 | pgvector 软回退、无 LLM key 时 UI/job 诚实度 |
| **B7** | Activity best-effort | 写失败不回滚 enqueue（可接受但应可观测） |
| **B8** | 进程生命周期 | Windows 进程树、重启 orphan、abort Map 仅活进程 |

### 1.4 刻意不做（C）

| 项 | 原因 |
|---|---|
| Multica daemon / `dispatched` + multi-claim / Redis 房间 | 纯本地单进程 |
| 云 Webhook（GitHub/Slack/Lark） | 宪法 |
| 密钥写 DB/UI | ADR 0003 |
| 后端强制 storyline merge API | 客户端 merge 已够 |
| 大规模 BI / 多租户归因 | 非阶段 |

### 1.5 后端 Top 8（ROI）

1. 统一 `decorateRunForRead`（含 ages / terminalReason / path-lock / auto-retry）  
2. opencode/cursor session resume 验证并开通  
3. Ops/Settings 队列样本 + path-lock holder  
4. 灾备：项目 Wiki 入 snapshot + 恢复覆盖报告  
5. 可选 live swap（在 4 之后，强闸门）  
6. 路由层关键路径契约测试  
7. Automation `run_only` 或 dry-run enrichment  
8. RunTree/子代理 DTO + messages preview 薄字段  

---

## 2. 前端交互 · 可提升点

### 2.1 短结论

7/26 的 F-02/03/05/07/09/10 及大量 UX 项 **已落地**（虚拟滚动、吸底、focus trap、pulse、窄屏、WS 路径 invalidate、Side Sheet、Confirm、Select 壳、故事线、partial…）。  
剩余是 **二阶体验**：输入层、页面模式层、噪音控制、次级面深度。

### 2.2 体验债表

| ID | 提升点 | 现状 | 对照 | 价值 | 成本 |
|---|---|---|---|---|---|
| **F1** | 评论/描述 **粘贴图 + 附件** | CommentComposer：textarea + @ + 草稿；无附件 | Multica TipTap + attachment | 高 | 中–高（可先附件后富编辑） |
| **F2** | Issue Sheet **够干活** | 轻量侧滑；深工作靠全页 | Multica split/property rail | 高 | 中 |
| **F3** | 故事线 **按 runId 去重** | activity `run_*` 可能与 run 双显 | Multica 单一 transcript 叙事 | 中–高 | **低** |
| **F4** | Banner **severity队列** | Env + WS + Working + Onboarding 可叠 | 少打断 | 中 | **低** |
| **F5** | HelperRail ≈ Chat | 浮窗薄于全页 Chat | Multica FloatingChat 共享 session | 中–高 | 中 |
| **F6** | 侧栏 **常用/更多** + g-chord 补全 | ops 段与日用并列；缺 g→squads/memory/projects | Multica 更「产品默认」 | 中 | **低** |
| **F7** | 指派 **可搜 combobox** | 长列表原生 Select | Multica custom dropdown | 中 | 中 |
| **F8** | CmdK 拼音/高亮/recent | 深链密、搜感一般 | Multica cmdk 质感 | 中 | 中 |
| **F9** | 失败恢复 **主 CTA 统一层级** | 链路通，文案/顺序偶发散 | Phase E 延续 | 中 | 低–中 |
| **F10** | Tool 只读面板（Slice 74） | pair 折叠；无独立 Tool 面 | Multica task-transcript | 中 | 中 |
| **F11** | Wiki **相关页/backlink** | 管理 > 探索 | deepwiki relatedPages | 中 | 中 |
| **F12** | 页面模式层 | Header/空态/保存节奏未全站统一 | Multica ui-consistency 同源 | 中 | 中 |
| **F13** | 列表 scroll restoration | 回列表易丢位置 | Multica scroll-restoration | 中 | 中 |

### 2.3 已很好、勿重开

看板 7 列+深链、列表+虚拟化、Side Sheet、故事线+Activity WS、partial 流、QC 闸门、Inbox 三栏、Runs Mission Control、CmdK 运维、focus trap/Confirm、窄屏抽屉、WS topic 订阅、Day0 卡、Settings 健康、Memory/Wiki 运维链。

### 2.4 前端 Top 10（日用痛感）

1. 写指令像记事本（附件/贴图优先于全量 TipTap）  
2. 看板侧滑不够干活  
3. 失败恢复信息有时散  
4. 故事线双显噪音  
5. Helper 与 Chat 能力落差  
6. 侧栏 + 角标 + banner 叠噪  
7. CmdK 能跳不能搜爽  
8. 指派长列表难选  
9. Wiki 文件柜感  
10. Tool/子代理过程偏工程向  

---

## 3. 参考项目 · 可借灵感（已滤宪法）

| 来源 | 可借 | 层 |
|---|---|---|
| **Multica** | 进度热事件 vs message 冷回放；lease 原因码进 UI；Automation 双模式 | 后端+前端 |
| **Hermes** | Tool dispatch 永不抛；探针 TTL 宽限；Memory 断路+注入跳过原因 | 健壮性 |
| **Pi** | AgentMessage vs LLM Message；mid-run steer **仅能力声明时** | 后端 |
| **mem0/OpenMemory** | pause/archive + AccessLog（谁/何时被注入） | 后端+前端 |
| **Graphiti** | as-of / superseded 字段（**无图 DB**） | 后端 |
| **openwiki** | 内容 hash 未变不刷「已更新」 | 后端 |
| **llm-wiki-agent** | 结构 health（零 LLM）一键报告 | 运维 |
| **deepwiki** | 章节树 + relatedPages | 前端 |
| **gstack** | 健康复合分 + 本地趋势 JSONL（无远程 telemetry） | 前端+健壮性 |

### 不该做

daemon+Redis 扩展、自造 agent loop、Neo4j 默认记忆、OpenDeepWiki 企业多租户/飞书、密钥入库、每 turn 全量 LLM lint、Wiki 图谱优先、mem0 云 ACL。

---

## 4. 健壮性盘点要点

| 模块 | 印象 | 备注 |
|---|---|---|
| Run 状态机/收尸/cancel | A- | 厚测 |
| Auto-retry + Automation | A- | 7/30 硬化 |
| Claude backend | B+ | resume 最全 |
| OpenCode/Cursor | B | 无 resume |
| Grok | C+ | ACP 半成品 |
| Pi | stub 健康 | 诚实失败 |
| 灾备 | B | stage-only 正确边界 |
| Wiki query/LLM | C+ | 依赖 key，测薄 |
| Memory pgvector | C | 无测、软降级 |
| issues/runs/chat HTTP | C+ | 逻辑有、路由测薄 |
| run-worker 直测 | B- | 覆盖空洞 |

**未发现「文档假完成」**；半成品多是诚实 stub 或 closeout 明文 Remaining。

---

## 5. 推荐下一波切片（Owner 可拍板）

### 波次 H1 · 低成本高感知（1–3 刀）

| 序 | 切片 | 类型 |
|---|---|---|
| 1 | 故事线 runId 折叠 + Banner 严重度队列 | 前端 |
| 2 | 统一 decorateRunForRead + path-lock holder 进 ops | 后端 |
| 3 | g-chord 补 squads/memory/projects + 侧栏常用/更多 | 前端 |

### 波次 H2 · 日用厚切片

| 序 | 切片 | 类型 |
|---|---|---|
| 4 | opencode/cursor session resume 开通（含 miss/poison） | 后端 |
| 5 | 评论/描述粘贴图+附件（后端存储 + Composer） | 全栈 |
| 6 | Issue Sheet 加深（故事线摘要 + 失败主 CTA） | 前端 |
| 7 | HelperRail 对齐 Chat 关键路径 | 前端 |

### 波次 H3 · 运维/知识纵深

| 序 | 切片 | 类型 |
|---|---|---|
| 8 | 灾备：项目 Wiki 入包 + 覆盖报告（再评估 live swap） | 后端 |
| 9 | Memory 注入跳过原因 + AccessLog 薄版 | 全栈 |
| 10 | Wiki 结构 health 一键 + hash 无变更不刷元数据 | 后端+前端 |
| 11 | 路由契约测试包（issues/runs/cancel/retry/automation） | 工程 |
| 12 | Slice 74 Tool 只读面板（可选） | 前端 |

### 默认不优先

全量 TipTap、多 Tab 壳、Wiki 图谱、daemon 1:1、云 webhook、Pi 全量 harness。

---

## 6. 与旧文档关系

| 文档 | 关系 |
|---|---|
| gap-analysis-full-2026-07-26 | 基线；B-01/F-02 等需按本报告 **重标状态** |
| phase-g-plan-2026-07-29 | R4/U4 等多条已 closeout；残留可并入本报告 H1–H3 |
| 7/30 closeouts | auto-retry、灾备 stage、observability、execution-log **已完成**，勿当未开工 |

---

## 7. 子代理任务 ID（可 resume）

| 主题 | subagent_id |
|---|---|
| Backend vs Multica | `019fb119-1a1d-7712-848d-06dab17a3e8a` |
| Frontend UX | `019fb119-1a1e-7b91-9079-bfdae58327be` |
| Reference inspirations | `019fb119-1a1f-7372-9b85-9256496eb3d0` |
| Robustness inventory | `019fb119-1a21-7e03-80b0-2cb4b1f0ba03` |

---

## 8. Phase land · 2026-07-30（本会话）

### 硬缺口 vs 刻意不做（验收用）

| 类 | 项 |
|---|---|
| **硬缺口（仍真）** | B1 auto-retry 与 queue age 语义；A1 CLI resume 不均；A3 path-lock holder 进 ops；A4 项目 Wiki 入灾备；F1 附件；F2 Sheet 加深；F5 Helper≈Chat |
| **本相落地** | **B1** + 前端 **F3 故事线 run 去重** |
| **刻意不做** | Multica daemon / Redis / 云 webhook / 密钥入库 / TipTap 全量 / Wiki 图谱优先 |

### 参考 grounding

- Multica：task failure taxonomy + waiting/lease reason 分离（读模型不把「计划等待」当「卡死」）
- 本仓：`deriveRunObservability` + `accumulateOpsQueueMetrics`；Multica 不 1:1 claim 协议

### Phase Must / Out

**Must**
1. `deriveRunObservability` 对 `nextAttemptAt > now` 的 queued/waiting 标记 `queueBlockedReason: 'retry_backoff'` + `queueEligibleAt`
2. Ops snapshot：`retryBackoff` 计数、`eligibleQueueAge` 排除 backoff；degraded 用 eligible 而非 raw queue max
3. Runs/Settings UI 显示退避文案，不把 backoff 当普通「排队过久」
4. 故事线：`run_*` activity 在已有 matching run 行时折叠（F3）
5. 单测驱动真实 shipped 函数（非 mock 被测逻辑）

**Out**
- live restore / path-lock holder / session resume 开通 / TipTap

### 改动面

- `app/packages/server/src/orchestration/run-observability.ts` (+ test)
- `app/packages/server/src/ops-snapshot.ts` (+ `accumulateOpsQueueMetrics` + test)
- `app/packages/shared/src/schema.ts`（AgentRun + OpsSnapshot + OpsQueueSample）
- `app/packages/web/components/RunsPage.tsx` / `SettingsPage.tsx`
- `app/packages/web/lib/issue-storyline.ts` (+ test)
