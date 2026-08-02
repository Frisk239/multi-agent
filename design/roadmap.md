# 路线与目标（2026-08-02 起为当前唯一真源）

> **本文件 = 路线 + 目标 + 切片队列真源。** 历史阶段（S01–S12、补1–5、Phase A–F）见 [slices.md](slices.md) 历史段 · 技术选型 [synthesis.md](synthesis.md) · 领域词汇与方位 [CONTEXT.md](../CONTEXT.md) · 工程宪法 [AGENTS.md](../AGENTS.md)。
>
> **生成依据（2026-08-02）：** 三份子代理分析（后端功能现状 / 前端交互现状 / 对照 references 上游 multica·hermes·pi）+ `app/.progress/` 规划文档（improvement-analysis、optimization-plan、gap-analysis-full、gap-close-wave-plan、next-wave-plan、must-close-checklist）未做项清单。已剔除 08-01 两波 closeout（optimization-wave / hard-gap-close-wave）中确认关闭的项，不重复开刀。

## §1 产品定位与北星（不变）

**产品一句话：** 纯本地软件工程多智能体编排平台——人在 Web 控制台派任务 → Agent 驱动本机编码 CLI → 产出进 **Wiki**、经验进 **Memory**。

**目标定位：** 复刻本地版 Multica 控制台体验（看板派活、小队、run 观测/恢复、Wiki/Memory、Settings 诊断），**不是** Multica daemon/云协议 1:1。按真实产品建设，答辩/论文不驱动排期（详见 [CONTEXT.md](../CONTEXT.md)）。

**架构钉死（勿在实现里推翻）：** 不自造 Agent loop（Backend adapter 驱动已有 CLI）· DB 行即锁（条件 UPDATE）· 多态指派 `(type, id)` · Squad = leader + briefing + mention · 纯本地（无 Redis/多节点/云托管）· 密钥不落库（ADR 0003）。

## §2 迭代机制（goal 模式 + Slice Owner）

```
人（/goal 定义目标 · 定北星与禁区）
   │
   ▼
Goal（本文件 §3 的 G1–G5；由用户用 /goal 创建/推进）
   │
   ▼
Slice Owner（自动迭代 · docs/agents/workflow.md）
   1) intake → 2) 探索/调研（子代理优先，查 references/deep）→ 3) 从 §4 切片队列取刀
   4) 实现（子代理优先）→ 5) 路径验收 → Playwright → push main → 关刀
   │
   ▼
progress 证据 → §4 队列状态更新 → CONTEXT.md 方位更新
```

- **本文件是「改进方向输入」**：每个 Goal 下是价值排序后的候选切片，供 `/goal` 定义目标时引用（Goal 编号 G1–G5 可直接引用）。
- **Slice Owner 取刀原则：** 优先队列头部；一刀 = 一条可演示用户路径（契约+API+UI 同刀）；Playwright 关刀；默认可 main 直推。
- **更新规则：** 切片关刀后由 Owner 更新 §4 状态列；Goal 增减需人点头（本文件是路线契约，不是流水账）。

## §3 目标体系（G1–G5）

> 排序依据：价值（日常使用频率 × 痛点强度）× 成本。每个 Goal 的子切片按价值降序。

### G1 执行层诚实性 — 产品可信

**目标陈述：** 每个 runtime backend 的「能力声明」与「真实行为」一致；失败可分类、可解释、可行动。

**现状基线：** Pi 已是真 backend（`pi --mode rpc` JSONL 三通道）但无真机验收；Grok 声明 `supportsSessionResume=true` 但 ACP 半成品（print 模式降级）；CLI 探测无失败宽限窗，瞬态失败会误报 runtime 缺失。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G1-1 | **Pi runtime 真机验收 + RPC 命令面扩展**（`steer`/`compact`/`set_model` 等，上游 rpc-types.ts:20-72 有蓝图，mock 已全绿） | 高 | 中 | — | ✅ |
| G1-2 | **Grok ACP/fail-closed**（补 ACP stdio 客户端，或摘除 `supportsSessionResume` 声明 + UI 标注降级） | 高 | 中 | — | ✅ |
| G1-3 | **CLI 探测失败宽限窗**（学 hermes `_check_fn_cached`：最近一次成功后 60s 内失败继续 serve 上次结果，防 flaky） | 中 | 小 | — | ✅ |
| G1-4 | **失败分类精度**（provider_network vs auth/quota 边界，驱动更准的自动改派与文案） | 中 | 中 | — | ✅ |
| G1-5 | **Memory/Wiki 降级可观测**（pgvector 软回退、无 LLM key 时 Wiki ingest 不反复重试 15min，给出诚实提示） | 中 | 小 | — | ⬜ |

### G2 编排闭环 — 任务有人接、状态诚实

**目标陈述：** 任务从创建到完成的每个无人接/卡死场景都有兜底路径；run 在任何入口展示一致的状态真相。

**现状基线：** P2-4 已建 `escalated_from_run_id` 改派 lineage；但「任务没人接/agent 卡死无响应」的惰性升级未做（multica `deferred` + `fire_at`，task.go:799）；automation 两种执行模式无「agent 离线」语义；WS/quick-run 等入口读投影与 `/api/runs` 不一致。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G2-1 | **Deferred-escalation 惰性升级**（`deferred` 状态 + `fire_at` + 清扫器，复用 escalated_from_run_id；multica 的「N 分钟无响应则升级」） | 高 | 中 | — | ✅ |
| G2-2 | **Autopilot 离线语义**（学 multica autopilot.go:200：`run_only` 离线时跳过记 `skipped`；`create_issue` 离线时允许） | 中 | 小 | — | ✅ |
| G2-3 | **子代理成本汇总进父 run**（学 hermes delegate_tool.py:2730：子 run USD 折入父节点，嵌套树自然汇总） | 中 | 小 | — | ✅ |
| G2-4 | **读投影残留清理**（WS 内部/quick-run 裸 shape → 统一 `toObservedAgentRun`，一处投影处处一致） | 中 | 小 | — | ✅ |
| G2-5 | **全局并发配额**（现在仅 per-agent `concurrency`，无全局在途上限） | 低 | 小 | — | ⬜ |

### G3 前端体验 — 少摩擦、可发现

**目标陈述：** 每个页面加载失败都有可行动的错误态；核心操作有键盘路径；run 的产出在上下文内可见。

**现状基线：** 三态（loading/error/empty）已系统性覆盖，但 Wiki 正文/Runtimes/记忆详情三处失败仍静默或无限 loading；看板拖拽仅 PointerSensor；Issue/Squad 详情的 run 历史只有深链无 inline 预览；Agent 环境变量编辑是原型 Must 里唯一 UI/API 双缺项。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G3-1 | **错误态三件套**（Wiki 页正文、RuntimesPage、记忆详情：isError → ErrorState + 重试；404 → 「页面不存在」） | 高 | 极小 | — | ✅ |
| G3-2 | **看板键盘拖拽 / 「移动到列」键盘路径**（注册 dnd-kit KeyboardSensor 或卡片菜单补键盘可达） | 中 | 小 | — | ✅ |
| G3-3 | **Issue/Squad 详情 inline transcript 预览**（run 历史行内展开消息摘要，复用 `pairRunToolEvents`；现状仅深链跳走） | 中 | 中 | — | ✅ |
| G3-4 | **Agent 环境变量/自定义参数编辑**（server schema `envVars` + AgentDetail UI，原型 Must 唯一双缺） | 中 | 中 | — | ✅ |
| G3-5 | **附件真实上传**（文件选择 + 拖拽 + IssueDetail 附件区，≤25MiB；现状仅粘贴图最小路径） | 中 | 中 | — | ✅ |
| G3-6 | **Issue 自定义字段 UI**（schema 有 customFields JSON，缺编辑界面，GAP-05） | 中 | 中 | — | ⬜ |
| G3-7 | **二阶体验池**（F8 CmdK polish / F13 列表 scroll restoration / F9 失败恢复 CTA 统一层级 / F7 指派可搜 combobox / F12 页面模式一致性） | 低·中 | 小·中 | — | ⬜ |

### G4 知识/记忆 — 长期价值

**目标陈述：** 记忆检索质量不随数据量退化；注入上下文干净（围栏不进 UI）；Wiki/Memory 在无密钥时诚实降级。

**现状基线：** sqlite-text 检索 = 最近 200 条内存过滤 + 全 token AND，无 FTS；prompt 注入有 `<memory-context>` 围栏但无剥离侧（CLI 回显会漏进 UI）；Wiki ingest 无 key 反复重试无提示。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G4-1 | **记忆检索升级**（SQLite FTS5 索引或索引化扫描，替代 200 行硬上限；顺带 scope 加权） | 高 | 中 | — | ✅ |
| G4-2 | **流式围栏 scrubber**（学 hermes `StreamingContextScrubber`：跨流 chunk 有状态剥 `<memory-context>`/`<think>`，防围栏漏进 UI 与回放） | 中 | 小 | — | ✅ |
| G4-3 | **Wiki ingest 无 key 降级诚实化**（不反复重试；UI 明确「未配 LLM key，Wiki 编译不可用」） | 中 | 小 | — | ✅ |
| G4-4 | **Memory scope 多维精化 + 注入跳过原因可观测**（B-10：四级 scope + 检索 AccessLog 薄版） | 中 | 中 | — | ✅ |
| G4-5 | **Wiki 二阶**（health 一键报告 / backlink 相关页 / `ma wiki query --roots` CLI flag） | 低·中 | 小 | — | 🔨 |

### G5 可靠性与运营 — 天天用不翻车

**目标陈述：** 高风险代码有回归网；灾备覆盖 Wiki；长跑运营有被动提醒与统计视图。

**现状基线：** skill/scanner + import-url（1095 行）无完整测试；auto-retry 核心逻辑有 `any` 类型退化；灾备 snapshot 已含 Wiki roots 但换入与覆盖报告未做；无系统通知、无运营统计。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G5-1 | **skill/scanner + import-url 完整测试**（全仓最大测试盲区，URL 导入涉及 GitHub API 解析/竞态） | 高 | 中 | — | ✅ |
| G5-2 | **auto-retry 类型安全化**（去 `any`/去反射，改 Drizzle 类型化路径） | 中 | 小 | — | ✅ |
| G5-3 | **灾备 Wiki 换入 + 覆盖报告**（stage.json 扩展 wiki 校验 → swap wiki 目录 → journal wiki 字段；reopenable-db 收尾） | 中 | 中 | — | ✅ |
| G5-4 | **进程生命周期收尾**（abort 注册表纯内存问题、重启 orphan、取消中崩溃的终态语义） | 中 | 中 | — | ✅ |
| G5-5 | **系统/桌面通知**（run 完成、inbox 新项；纯本地，可用 Electron shell/notify 类机制） | 中 | 中 | — | ⬜ |
| G5-6 | **运营统计加深**（cycle time / agent 利用率 / 失败率·改派率趋势；现 analytics 仅 token-usage） | 低·中 | 中 | — | ⬜ |
| G5-7 | **Issue/看板 JSON 导入导出**（迁移与备份场景；现仅 DB 级 ops-backup） | 低 | 中 | — | ⬜ |

## §4 切片队列总表（建议迭代顺序）

> 状态列：⬜ 未开 · 🔨 进行中 · ✅ 已关。关刀后由 Slice Owner 更新。

| 序 | 切片 | Goal | 建议理由 |
|---|---|---|---|
| 1 | G3-1 错误态三件套 | G3 | ✅ 已关（2026-08-02，[closeout](app/.progress/g3-1-error-states-closeout-2026-08-02.md)） |
| 2 | G1-1 Pi 真 backend | G1 | ✅ 已关（2026-08-02，[closeout](app/.progress/g1-1-pi-real-closeout-2026-08-02.md)） |
| 3 | G2-1 Deferred-escalation | G2 | ✅ 已关（2026-08-02，[closeout](app/.progress/g2-1-deferred-escalation-closeout-2026-08-02.md)） |
| 4 | G1-2 Grok ACP/fail-closed | G1 | ✅ 已关（2026-08-02，[closeout](app/.progress/g1-2-grok-failclosed-closeout-2026-08-02.md)；fail-closed 基线，ACP 客户端另立后续刀） |
| 5 | G4-1 记忆检索 FTS5 | G4 | ✅ 已关（2026-08-02，[closeout](app/.progress/g4-1-memory-fts-closeout-2026-08-02.md)） |
| 6+ | G1-3 · G2-2 · G4-3 | 其余 | ✅ 已关（2026-08-02，[G1-3](app/.progress/g1-3-probe-grace-closeout-2026-08-02.md) · [G2-2](app/.progress/g2-2-autopilot-offline-closeout-2026-08-02.md) · [G4-3](app/.progress/g4-3-wiki-nokey-honest-closeout-2026-08-02.md)） |
| 7 | G1-4 · G2-3 · G3-2 | 其余 | ✅ 已关（2026-08-02 M2，[G1-4](app/.progress/g1-4-failure-classify-closeout-2026-08-02.md) · [G2-3](app/.progress/g2-3-cost-rollup-closeout-2026-08-02.md) · [G3-2](app/.progress/g3-2-kanban-keyboard-closeout-2026-08-02.md)） |
| 8 | **下一刀 M3（Goal 第二波顺序）** | G2/G4 | G2-4 读投影残留清理 → G4-4 Memory scope 多维精化（M3 按目标陈述顺序；此后 M4：G5-1 → G5-2，再按 §3 价值取用） |
| 9 | G2-4 · G4-4 | 其余 | ✅ 已关（2026-08-02 M3，[G2-4](app/.progress/g2-4-projection-cleanup-closeout-2026-08-02.md) · [G4-4](app/.progress/g4-4-memory-scope-closeout-2026-08-02.md)） |
| 11 | **M3 Must 补全（G3-3/G3-4/G3-5）+ G4-5 CLI 部分** | G3/G4 | ✅ 已关（2026-08-02 第三波，[closeout](app/.progress/goal3-wave-closeout-2026-08-02.md)；G4-5 余 health/backlink 留后续） |
| 10 | M4 工程债（G5-1/G5-2）+ M2 可靠性（G5-3/G5-4） | G5 | ✅ 已关（2026-08-02 第三波，[closeout](app/.progress/goal3-wave-closeout-2026-08-02.md)） |

**取刀规则：** 序号仅建议；Slice Owner 可按「当前痛点 + 依赖就绪」在 §3 池中取刀，但 Goal 优先级（G1/G2 > G3/G4 > G5）默认不动。一刀跨 Goal 时挂主要 Goal。

## §5 刻意不做（边界，勿当 blocker）

- 云 webhook 触发 / 云托管 / 多节点 / Redis 房间（宪法「纯本地」）
- Multica daemon/云协议 1:1、daemon 化服务
- 密钥写入 DB/UI（ADR 0003，env-only）
- TipTap 全量富文本 / 多 Tab 壳 / Wiki 图谱大屏（vis.js 优先不做）
- 泳道/甘特视图、多人 RBAC / 多用户、后端强制 storyline merge API
- Deferred 默认强制改派（默认路径 = 惰性升级，见 G2-1；不做「无条件改派」）
- Pi 真执行 harness（指自建完整 harness；Pi 作为 backend 驱动是真航道，见 G1-1）
- 大规模 BI / 论文消融专属脚本（可选支线，不挡产品主线）

## §6 风险与对策

| 风险 | 对策 |
|---|---|
| 范围过大 / 一刀变重构 | 每刀端到端可演示（契约+API+UI 同刀）；G3-7 二阶体验池按痛点单点取用 |
| 分析结论过时 | 取刀前先 grep 对应 closeout；§3 每条来源已注明，开工时复核状态 |
| Goal 漂移 / 文档失真 | §4 状态列随关刀更新；Goal 增减需人点头；CONTEXT.md 方位段只指路不重复队列 |
| 跨会话上下文丢失 | 一切片一会话 + handoff + progress；本文件是跨会话唯一路线记忆 |
| 上游参考过期 | 以 `references/deep/` 深读为准（带 file:line）；必要时 grep `references/repos/` 复核 |
