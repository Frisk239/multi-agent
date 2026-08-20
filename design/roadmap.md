# 路线与目标（2026-08-02 起为当前唯一真源）

> **本文件 = 路线 + 目标 + 切片队列真源。** 历史阶段（S01–S12、补1–5、Phase A–F）见 [slices.md](slices.md) 历史段 · 技术选型 [synthesis.md](synthesis.md) · 领域词汇与方位 [CONTEXT.md](../CONTEXT.md) · 工程宪法 [AGENTS.md](../AGENTS.md)。
>
> **生成依据（2026-08-02）：** 三份子代理分析（后端功能现状 / 前端交互现状 / 对照 references 上游 multica·hermes·pi）+ `app/.progress/` 规划文档（improvement-analysis、optimization-plan、gap-analysis-full、gap-close-wave-plan、next-wave-plan、must-close-checklist）未做项清单。已剔除 08-01 两波 closeout（optimization-wave / hard-gap-close-wave）中确认关闭的项，不重复开刀。
> **追加（2026-08-03）：** G1–G5 池 + 第七波全部收官后，新派两份子代理差距分析（后端 10 条 / 前端 13 条，已剔除已修项与宪法禁区项）→ 注册 **G6（后端执行与运营精细度）** 与 **G7（前端体验第二波）**。

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

**现状基线：** Pi 已是真 backend（`pi --mode rpc` JSONL 三通道）但无真机验收；Grok 已是完整 ACP stdio 客户端（2026-08-03 收官：会话续跑 + usage 落库 + 失败诚实分类，[closeout](app/.progress/grok-acp-closeout-2026-08-03.md)）；CLI 探测无失败宽限窗，瞬态失败会误报 runtime 缺失。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G1-1 | **Pi runtime 真机验收 + RPC 命令面扩展**（`steer`/`compact`/`set_model` 等，上游 rpc-types.ts:20-72 有蓝图，mock 已全绿） | 高 | 中 | — | ✅ |
| G1-2 | **Grok ACP stdio 客户端**（完整 ACP：initialize→authenticate→session/new\|load→prompt→drain；usage 落库 + `supportsSessionResume=true` 恢复；2026-08-03 [closeout](app/.progress/grok-acp-closeout-2026-08-03.md)，真机 2 回合：fresh 产出 + resumed 上下文延续「42」） | 高 | 中 | — | ✅ |
| G1-3 | **CLI 探测失败宽限窗**（学 hermes `_check_fn_cached`：最近一次成功后 60s 内失败继续 serve 上次结果，防 flaky） | 中 | 小 | — | ✅ |
| G1-4 | **失败分类精度**（provider_network vs auth/quota 边界，驱动更准的自动改派与文案） | 中 | 中 | — | ✅ |
| G1-5 | **Memory/Wiki 降级可观测**（pgvector 软回退、无 LLM key 时 Wiki ingest 不反复重试 15min，给出诚实提示） | 中 | 小 | — | ✅（2026-08-03，[closeout](app/.progress/g1-5-pgvector-fallback-closeout-2026-08-03.md)：pgvector 启动软回退状态标记 + Settings 降级徽标；运行时切换刻意不做——两套物理存储会分叉数据） |

### G2 编排闭环 — 任务有人接、状态诚实

**目标陈述：** 任务从创建到完成的每个无人接/卡死场景都有兜底路径；run 在任何入口展示一致的状态真相。

**现状基线：** P2-4 已建 `escalated_from_run_id` 改派 lineage；但「任务没人接/agent 卡死无响应」的惰性升级未做（multica `deferred` + `fire_at`，task.go:799）；automation 两种执行模式无「agent 离线」语义；WS/quick-run 等入口读投影与 `/api/runs` 不一致。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G2-1 | **Deferred-escalation 惰性升级**（`deferred` 状态 + `fire_at` + 清扫器，复用 escalated_from_run_id；multica 的「N 分钟无响应则升级」） | 高 | 中 | — | ✅ |
| G2-2 | **Autopilot 离线语义**（学 multica autopilot.go:200：`run_only` 离线时跳过记 `skipped`；`create_issue` 离线时允许） | 中 | 小 | — | ✅ |
| G2-3 | **子代理成本汇总进父 run**（学 hermes delegate_tool.py:2730：子 run USD 折入父节点，嵌套树自然汇总） | 中 | 小 | — | ✅ |
| G2-4 | **读投影残留清理**（WS 内部/quick-run 裸 shape → 统一 `toObservedAgentRun`，一处投影处处一致） | 中 | 小 | — | ✅ |
| G2-5 | **全局并发配额**（现在仅 per-agent `concurrency`，无全局在途上限） | 低 | 小 | — | ✅（2026-08-03，[closeout](app/.progress/g2-5-global-concurrency-closeout-2026-08-03.md)：workspace max_concurrent_runs，拦 claim 不拦 enqueue，排队不算在途） |
| G2-6 | **Automation schedule catch-up truth**（schedule source 锚点、24h latest-only、5 分钟过窗 skipped 审计；不回放旧任务） | 高 | 中 | G2-2、G6-2 | ✅（2026-08-19，[closeout](app/.progress/automation-schedule-catchup-truth-impl-1.md)） |
| G2-7 | **Automation 规则归档保留历史**（DELETE 归档并停未来派发，保留 AutomationRun/Issue/Run 证据） | 高 | 中 | G2-6 | ✅（2026-08-20，[closeout](app/.progress/automation-rule-archive-preserves-history-impl-1.md)：migration 0054、历史保留、生命周期 409 与真实 Playwright） |
| G2-8 | **批量改指派派活一致性**（看板批量指派复用单条目标校验与 enqueue 决策，回传每张卡真实入队/跳过结果；不隐式取消在途 run） | 高 | 中 | 既有单条 assign/enqueue | ✅（2026-08-20，[closeout](app/.progress/bulk-assignment-dispatch-parity-impl-1.md)） |

### G3 前端体验 — 少摩擦、可发现

**目标陈述：** 每个页面加载失败都有可行动的错误态；核心操作有键盘路径；run 的产出在上下文内可见。

**现状基线：** 三态（loading/error/empty）已系统性覆盖，但 Wiki 正文/Runtimes/记忆详情三处失败仍静默或无限 loading；看板拖拽仅 PointerSensor；Issue/Squad 详情的 run 历史只有深链无 inline 预览；Agent 环境变量编辑是原型 Must 里唯一 UI/API 双缺项。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G3-1 | **错误态三件套**（Wiki 页正文、RuntimesPage、记忆详情：isError → ErrorState + 重试；404 → 「页面不存在」） | 高 | 极小 | — | ✅ |
| G3-2 | **看板键盘拖拽 / 「移动到列」键盘路径**（注册 dnd-kit KeyboardSensor 或卡片菜单补键盘可达） | 中 | 小 | — | ✅ |
| G3-3 | **Issue/Squad 详情 inline transcript 预览**（run 历史行内展开消息摘要，复用 `pairRunToolEvents`；现状仅深链跳走） | 中 | 中 | — | ✅ |
| G3-4 | **Agent 环境变量/自定义参数编辑**（server schema `envVars` + AgentDetail UI，原型 Must 唯一双缺） | 中 | 中 | — | ✅ |
| G3-4b | **执行层注入闭环**（G3-4 编辑已存未用：envVars 合并 spawn env 显式覆盖 process.env + customArgs 各 backend argv 注入，opencode 插 prompt 前、余尾部） | 中 | 小 | G3-4 | ✅ |
| G3-5 | **附件真实上传**（文件选择 + 拖拽 + IssueDetail 附件区，≤25MiB；现状仅粘贴图最小路径） | 中 | 中 | — | ✅ |
| G3-6 | **Issue 自定义字段 UI**（schema 有 customFields JSON，缺编辑界面，GAP-05） | 中 | 中 | — | ✅ |
| G3-7 | **二阶体验池**（F8 CmdK polish / F13 列表 scroll restoration / F9 失败恢复 CTA 统一层级 / F7 指派可搜 combobox / F12 页面模式一致性） | 低·中 | 小·中 | — | 🔨（第四波已落 CmdK 高亮 + 失败卡一键重试；余项池内多已存在：拼音/scroll restoration/指派搜索——待按痛点续取） |
| G3-8 | **Runs Mission Control 任务语义 + 定位**（Issue/会话标题、有效项目、服务端 q/project 与 URL 锚点） | 高 | 中 | — | ✅（2026-08-19，[closeout](app/.progress/runs-mission-control-subjects-impl-1.md)） |
| G3-9 | **Issue run 区块真实性**（runs 请求失败显示局部错误 + retry，不能伪装为空态） | 高 | 小 | — | ✅（2026-08-19，[closeout](app/.progress/issue-runs-truthful-error-impl-1.md)） |
| G3-10 | **Chat 标题与安全删除**（行内改名；仅归档后可删；有任何 run 时保留历史） | 中 | 中 | — | ✅（2026-08-19，[closeout](app/.progress/chat-title-safe-delete-impl-1.md)） |
| G3-11 | **Issue 评论线程与结论 UI**（根评论 + 一层回复；定论/撤销；已定论默认折叠且可展开） | 高 | 小 | 既有 S3 评论契约 | ✅（2026-08-19，[closeout](app/.progress/issue-comment-thread-conclusion-ui-impl-1.md)） |
| G3-12 | **Agents roster 当前任务可行动化**（批量 active Issue 投影；单条直达 Run，多条直达筛选列表；chat 不伪装 Issue） | 高 | 小 | 既有 run/Issue 读模型 | ✅（2026-08-19，[closeout](app/.progress/agent-active-task-peek-impl-1.md)） |
| G3-13 | **Agent 详情直达派活**（“分配工作”预填 New Issue；保留独立“查看已指派 Issue”；复用 readiness/preflight 与 enqueue） | 高 | 小 | G3-12 + 既有 NewIssueForm | ✅（2026-08-19，[closeout](app/.progress/agent-direct-issue-create-impl-1.md)） |
| G3-14 | **Automation Run Now 结果真实性**（HTTP 201 与领域成功分离；warning/repair/最近执行保留） | 高 | 小 | G2-2 + 既有 AutomationRun | ✅（2026-08-19，[closeout](app/.progress/automation-run-now-truth-impl-1.md)） |
| G3-15 | **Automation 连续跳过一键钻取**（20 条窗口内的 skipped 告警直达原因组；不误报完整总数） | 中 | 小·中 | G6-7、G2-6 | ✅（2026-08-20，[closeout](app/.progress/automation-skipped-streak-drilldown-impl-1.md)） |
| G3-16 | **CmdK 项目上下文直达**（缓存项目按标题/描述/本机目录确定性搜索，独立组显示状态/目录，Enter 进详情） | 中 | 小 | 既有 Project 读模型 | ✅（2026-08-20，[closeout](app/.progress/cmdk-project-context-impl-1.md)） |

### G4 知识/记忆 — 长期价值

**目标陈述：** 记忆检索质量不随数据量退化；注入上下文干净（围栏不进 UI）；Wiki/Memory 在无密钥时诚实降级。

**现状基线：** sqlite-text 检索 = 最近 200 条内存过滤 + 全 token AND，无 FTS；prompt 注入有 `<memory-context>` 围栏但无剥离侧（CLI 回显会漏进 UI）；Wiki ingest 无 key 反复重试无提示。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G4-1 | **记忆检索升级**（SQLite FTS5 索引或索引化扫描，替代 200 行硬上限；顺带 scope 加权） | 高 | 中 | — | ✅ |
| G4-2 | **流式围栏 scrubber**（学 hermes `StreamingContextScrubber`：跨流 chunk 有状态剥 `<memory-context>`/`<think>`，防围栏漏进 UI 与回放） | 中 | 小 | — | ✅ |
| G4-3 | **Wiki ingest 无 key 降级诚实化**（不反复重试；UI 明确「未配 LLM key，Wiki 编译不可用」） | 中 | 小 | — | ✅ |
| G4-4 | **Memory scope 多维精化 + 注入跳过原因可观测**（B-10：四级 scope + 检索 AccessLog 薄版） | 中 | 中 | — | ✅ |
| G4-5 | **Wiki 二阶**（health 一键报告 / backlink 相关页 / `ma wiki query --roots` CLI flag） | 低·中 | 小 | — | ✅（第三波 CLI --roots + 第四波 backlink；health 一键报告第四波确认已闭环） |

### G5 可靠性与运营 — 天天用不翻车

**目标陈述：** 高风险代码有回归网；灾备覆盖 Wiki；长跑运营有被动提醒与统计视图。

**现状基线：** skill/scanner + import-url（1095 行）无完整测试；auto-retry 核心逻辑有 `any` 类型退化；灾备 snapshot 已含 Wiki roots 但换入与覆盖报告未做；无系统通知、无运营统计。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G5-1 | **skill/scanner + import-url 完整测试**（全仓最大测试盲区，URL 导入涉及 GitHub API 解析/竞态） | 高 | 中 | — | ✅ |
| G5-2 | **auto-retry 类型安全化**（去 `any`/去反射，改 Drizzle 类型化路径） | 中 | 小 | — | ✅ |
| G5-3 | **灾备 Wiki 换入 + 覆盖报告**（stage.json 扩展 wiki 校验 → swap wiki 目录 → journal wiki 字段；reopenable-db 收尾） | 中 | 中 | — | ✅ |
| G5-4 | **进程生命周期收尾**（abort 注册表纯内存问题、重启 orphan、取消中崩溃的终态语义） | 中 | 中 | — | ✅ |
| G5-5 | **系统/桌面通知**（run 完成、inbox 新项；纯本地，可用 Electron shell/notify 类机制） | 中 | 中 | — | ✅（第四波：零依赖 PowerShell 弹窗 + Settings 开关默认关） |
| G5-6 | **运营统计加深**（cycle time / agent 利用率 / 失败率·改派率趋势；现 analytics 仅 token-usage） | 低·中 | 中 | — | ✅（第四波：/api/analytics/ops + UsagePage 运营区） |
| G5-7 | **Issue/看板 JSON 导入导出**（迁移与备份场景；现仅 DB 级 ops-backup） | 低 | 中 | — | ✅（第四波：/api/issues/export + import，看板按钮） |
| G5-8 | **Worker tick 健康真实性**（四个常驻 loop 仅成功 heartbeat；失败连续数/时间/脱敏摘要贯穿 healthz、ops、Settings） | 高 | 小 | — | ✅（2026-08-19，[closeout](app/.progress/worker-tick-health-truth-impl-1.md)） |

### G6 后端执行与运营精细度 — 调度公平、副作用诚实、盲区清零（新，2026-08-03 注册）

**目标陈述：** run 调度按优先级公平（紧急不排后）；自动化派发的副作用严格发生在幂等占位之后；失败/跳过/静默吞错全部可观测；主路径模块测试盲区清零。

**现状基线：** run 认领 FCFS（`run-worker.ts:116` 仅按 createdAt）；automation 派发先副作用后守卫行（`automation-dispatch.ts:321→347`，重叠 tick 可致重复 Issue/孤儿 run）；sweeper 多处全表扫描 + N+1 + 「假批量」注释（`stale-runs.ts:191-630`）；claude-code / run-service（519 行熔断·改派）/ wiki-llm 无直测；pi `extension_ui_request` 已采用无人值守自动取消；无请求级慢日志；inbox/activity 写失败静默吞。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G6-1 | **run 认领按优先级调度**（agent_run 加 priority 快照列，enqueue 时从 issue 拷贝；tick 按 `priority DESC + createdAt ASC` 认领；学 multica `agent.sql:349` `ORDER BY atq.priority DESC, atq.created_at ASC`） | 中 | 小 | — | ✅（2026-08-03，[closeout](app/.progress/g6-1-priority-scheduling-closeout-2026-08-03.md)；快照列 + 5 处 enqueue 拷贝/继承 + CASE 数值序认领 + 3 用例；全量 1491 用例绿） |
| G6-2 | **Automation 派发幂等顺序修复**（先插 `(rule_id, planned_at)` 占位行/事务，赢家才干活；或进程内单飞互斥；学 multica tryClaim「先占位后 Handler」`manager.go:95`） | 中 | 小 | — | ✅（2026-08-03，[closeout](app/.progress/g6-2-automation-placeholder-closeout-2026-08-03.md)；两阶段占位：UNIQUE 判定赢家 → 赢家才建卡/enqueue，输家零副作用；超龄占位升级 failed；全量 1495 用例绿） |
| G6-3 | **核心模块测试补网**（claude-code args 抽纯函数 + run-service enqueue 决策/熔断阈值边界 + wiki-llm 降级分支直测；复用 `__test-helpers__/livebind` 基建） | 高 | 中 | — | ✅（2026-08-03，[closeout](app/.progress/g6-3-test-net-closeout-2026-08-03.md)；buildClaudeArgv 纯函数 + 6 用例 · llm 双 provider/无 key/模板/归一化 11 用例 · enqueue 熔断 14/15 边界 + QC 不计数 + 去重 4 用例；全量 1516 用例绿） |
| G6-4 | **Sweeper 收尸路径原子化 + 假批量注释修正**（无内存依赖路径改单条条件 UPDATE，学 multica `agent.sql:569`；deferred 查重去 N+1；修「批量更新」注释与行为不符的诚实性污点） | 低·中 | 小 | — | ✅（2026-08-03，[closeout](app/.progress/g6-4-sweeper-atomic-closeout-2026-08-03.md)；escalateFailedSquadRuns 逐条条件 UPDATE + 幂等 + 注释修正；deferred N+1 去重；+4 用例；全量 1526 用例绿） |
| G6-5 | **消息/列表端点游标分页 + 形状统一**（`/api/runs/:id/messages` 加 `?afterSeq=&limit=`；列表端点统一 `{data}` 形状，PaginatedResponse 契约全量执行） | 低 | 小 | — | ✅（2026-08-08；消息接口游标 + 500 上限，Run 详情增量加载） |
| G6-6 | **pi extension_ui_request 无人值守闭环**（confirm/select/input/editor 立即回传 cancelled，并用 run log 说明，不再静默卡到 idle） | 低·中 | 小 | — | ✅（2026-08-08；阻塞式请求 fail-closed 自动取消，保留 per-run 解释日志） |
| G6-7 | **Automation 连续 skipped 运营警示**（最近 N 次 dispatch 全 skipped → Settings 规则标黄 + 文案；可选复用 G5-5 系统通知） | 低·中 | 小 | — | ✅（2026-08-08；连续 3 次显示运营警示） |
| G6-8 | **请求级慢日志**（Fastify onResponse：>1s 请求记 warn，含 path/耗时/状态码；用户报「某页慢」有据可查） | 低 | 极小 | — | ✅（2026-08-03，[closeout](app/.progress/g6-8-slow-log-closeout-2026-08-03.md)；onResponse hook + 纯函数 5 用例；全量 1522 用例绿） |
| G6-9 | **memory pgvector/embedder 测试**（provider 选择/软回退逻辑直测，防 G1-5 降级行为漂移；embedder 无 key/网络失败分支钉死） | 低 | 小 | — | ✅（2026-08-03，[closeout](app/.progress/g6-9-embedder-test-closeout-2026-08-03.md)；embedder 10 用例：config 默认/覆盖、无 key/HTTP/dims 分支、index 排序、vectorLiteral；manager G1-5 回归；全量 1540 用例绿） |
| G6-10 | **inbox/activity 写失败可观测**（logger.warn + 计数进 ops-snapshot，不再静默吞） | 低 | 极小 | — | ✅（2026-08-03，[closeout](app/.progress/g6-10-inbox-observability-closeout-2026-08-03.md)；notifyInbox 汇聚点降级 warn + 计数 + snapshot 透出；+4 用例；全量 1530 用例绿） |

### G7 前端体验第二波 — 高频往返零摩擦、页面活性诚实、长列表流畅（新，2026-08-03 注册）

**目标陈述：** 看板-详情高频往返零摩擦（后退可关面板、返回不闪屏）；页面活性诚实（Memory 实时可见）；长列表流畅（transcript 虚拟化）；表单/键盘/文案一致性补齐。

**现状基线：** 看板 Sheet 用 `router.replace` 打开、无 popstate 处理，后退键不关面板（`KanbanBoard.tsx:304-320`）；`useIssues` 无 staleTime，看板返回全量 refetch + skeleton 闪烁（`lib/api/issues.ts:39-47`）；Memory 页无 WS topic/轮询，ambient 记忆不实时（`lib/ws.ts:111-146`）；RunDetail transcript 全量 DOM 无虚拟化（`RunDetailPage.tsx:892-1035`，`@tanstack/react-virtual` 依赖已在）；新建 Issue 指派是原生 select 不可搜（`AssigneeSelect` 未复用）。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G7-1 | **看板 Sheet 后退键关闭**（openIssueSheet 改 `router.push` + URL 驱动关闭，Back 一次即关；学 Linear/Notion 侧滑面板心智；已开面板换卡用 replace 防污染筛选历史） | 高 | 小 | — | ✅（2026-08-04，[closeout](app/.progress/g7-frontend-wave-closeout-2026-08-04.md)） |
| G7-2 | **useIssues staleTime 30s**（看板返回不整板重拉白闪；invalidateQueries 仍强制 refetch，WS 实时性不受影响） | 中 | 小 | — | ✅（同上） |
| G7-3 | **Memory 页实时更新**（useMemoryList refetchInterval 15s；服务端无 memory WS 广播，轮询为最小诚实路径，完成 issue 的 ambient 记忆 15s 内可见） | 中 | 极小 | — | ✅（同上） |
| G7-4 | **Run transcript 虚拟化**（复用 `@tanstack/react-virtual`：≥100 条事件切窗口化，绝对定位 + measureElement 动态测量 + gap；展开态窗口感知——expanded 只保留窗口内 key） | 中 | 中 | — | ✅（同上；e2e 注入 120 条消息 run 实测 rendered 22/120） |
| G7-5 | **Sheet 属性补强**（优先级 Select 入 SheetMeta + 标签行内编辑复用 `IssueLabelsEditor`；「扫板-处理」不跳出看板） | 中 | 小·中 | — | ✅（同上） |
| G7-6 | **新建 Issue 表单可搜指派**（抽出受控 `AssigneeCombobox` 与详情页同源：搜索 + readiness 提示/禁用；onChange 业务副作用留在调用方） | 低 | 小 | — | ✅（同上） |
| G7-7 | **Inbox Enter 打开**（j/k 移动选中此前已存在；本刀补 Enter = 打开选中项完整目标：issue 全页 / run 深链 / 兜底主 CTA；聚焦交互元素时交还原生行为） | 低 | 小 | — | ✅（同上） |
| G7-8 | **Toast 堆叠上限 + hover 暂停**（上限 4 条挤掉最旧；hover 完全冻结倒计时（存剩余毫秒），移出续倒；带 action 消息体与独立 × 关闭钮分离；+5 用例） | 低 | 小 | — | ✅（同上） |
| G7-9 | **各页 document.title 区分**（新 `usePageTitle` hook：issue 标题/run 短 id 拼接；接线 7 页：看板/运行列表/运行详情/记忆/收件箱/Wiki/Issue 详情；卸载还原基础标题） | 低 | 极小 | — | ✅（同上） |
| G7-10 | **Wiki 分享链改复制按钮**（复制完整 URL + 「已复制」1.5s 反馈，与 Memory 页 copyText 模式一致；原 Link 点击无操作已修） | 低 | 极小 | — | ✅（同上） |
| G7-11 | **Memory 空/错/loading 行 colSpan 修复**（thead 实为 8 列，3 处 7→8） | 低 | 极小 | — | ✅（同上） |
| G7-12 | **看板工具栏收纳导入/导出**（低频运维按钮收进「筛选」展开区 + 分隔线；功能本身 G5-7 已关不动，只动摆放） | 低 | 极小 | — | ✅（同上） |

### G8 可信执行 — 声明与真实世界一致（2026-08-10 注册）

**目标陈述：** 崩溃后 CLI 可 reconcile；旧密钥不长期躺 SQLite；派活前知道「装了 ≠ 能跑」；看板路径锁等待可见；transcript 不无意落密钥；长轨迹看最新；running 再评能接上。

| 切片 | 说明 | 价值 | 成本 | 依赖 | 状态 |
|---|---|---|---|---|---|
| G8-1 | 看板 `waiting_local_directory` 活性 | 高 | 小 | — | ✅（工作区随本波合入） |
| G8-2 | 崩溃后 CLI execution ownership（禁 PID 盲杀） | 高 | 中 | — | ✅（[closeout](app/.progress/g8-execution-ownership-impl-1.md)） |
| G8-3 | 旧密钥清库 + envRef fail-closed + 备份诚实 | 高 | 中 | — | ✅（[closeout](app/.progress/g8-secret-safety-impl-1.md)） |
| G8-4a | Runtime preflight 状态/capability UI 诚实（无真 probe） | 高 | 中 | — | ✅（[closeout](app/.progress/g8-preflight-readiness-impl-1.md)） |
| G8-4b | 无副作用 adapter probe | 中 | 中 | 一手证据 | ⬜ 禁开 |
| G8-5a | transcript 写前密钥脱敏 | 高 | 中 | G8-3 | ✅（[closeout](app/.progress/g8-transcript-scrub-impl-1.md)） |
| G8-6 | 看板 Sheet 最新尾窗 + beforeSeq + 就地再执行 | 高 | 中 | G6-5 | ✅（[closeout](app/.progress/g8-6-board-live-transcript-impl-1.md)） |
| G8-7 | **归档 Agent 派发硬闸与遗留收口**（归档=未来不可派发；所有 queued/waiting/deferred/running run 诚实取消并保留历史；worker 防竞态 claim） | 高 | 中 | 既有 run ownership | ✅（2026-08-20，[closeout](app/.progress/archived-agent-dispatch-fence-impl-1.md)） |
| follow-up | running 再评排队 1 条 follow-up + 同 Agent × Issue claim 串行（concurrency>1 也不并发） | 高 | 中 | — | ✅（[enqueue closeout](app/.progress/comment-followup-queue-impl-1.md) · [serial claim closeout](app/.progress/followup-serial-claim-impl-1.md)） |

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
| 12 | **G3-4b 执行层注入（envVars/customArgs spawn 生效）** | G3 | ✅ 已关（2026-08-02 第四波 M1，[closeout](app/.progress/g34b-env-inject-closeout-2026-08-02.md)；printenv 实证 grok run completed 报告值一致；claude 无额度故 grok 实证） |
| 13 | **第四波（运营闭环+最终打磨）：G5-5 · G5-6 · G4-5b · G5-7 · G3-7×2** | G3/G4/G5 | ✅ 已关（2026-08-02/03，[closeout](app/.progress/goal4-wave-closeout-2026-08-02.md)：系统通知 · 运营统计 · wiki backlink · JSON 导入导出 · CmdK 高亮+失败卡重试；Playwright 7/7 PASS；**G1–G5 池仅剩 G1-2 ACP 大工程**） |
| 14 | **第五波（剩余小刀收尾）：G2-5 · G1-5** | G2/G1 | ✅ 已关（2026-08-03，[G2-5](app/.progress/g2-5-global-concurrency-closeout-2026-08-03.md) 全局并发配额 · [G1-5](app/.progress/g1-5-pgvector-fallback-closeout-2026-08-03.md) pgvector 软回退可观测；全量 1401 用例绿；**G1–G5 池仅剩 G1-2 ACP 大工程（唯一剩余）**） |
| 15 | **第六波（G1-2 ACP 大工程收官）：Grok ACP stdio 客户端** | G1 | ✅ 已关（2026-08-03，[closeout](app/.progress/grok-acp-closeout-2026-08-03.md)：ACP 传输层 + mock 测试网（51 契约用例）+ 真机 2 回合验收（fresh「记住了42」/ resumed「42」上下文延续 + usage 落库）+ Playwright 7/7 PASS；**G1–G5 池全部收官**） |
| 16 | **第七波（品质波）：M1 ACP 边界 · M2 技术债 · M3 性能 · M4 摩擦清扫**（Q1–Q7，Goal 自编号） | — | ✅ 已关（2026-08-03：Q1 [set_model UI](app/.progress/q1-set-model-ui-closeout-2026-08-03.md) 真机 pi 200/grok-4.5 绑定回读 · Q2 [MCP 经 ACP 注入](app/.progress/q2-mcp-inject-closeout-2026-08-03.md) 真机 fs__read_text_file 读到文件 · Q3 api.ts 拆分 10 领域模块 barrel 兼容 · Q4 KanbanBoard 拆分 3 模块 + dnd 纯函数 · M2c Settings「在途 x/上限 y」· M4a 流式分块合并 35 chunk→1 段落 · Q6 [settings/status 3s→0.21s](app/.progress/q6-perf-settings-status-closeout-2026-08-03.md) · Q7 [全链路走查摩擦清扫](app/.progress/q7-walkthrough-closeout-2026-08-03.md)（WS URL 推导 / grok 模型列表可用项 / onboarding-status 缓存）；全量 1488 用例绿（shared 121 + server 902 + web 465）） |
| 17 | **第八波（后端精细度）：G6-1 → G6-2 → G6-3** | G6 | G6-1 ✅（[closeout](app/.progress/g6-1-priority-scheduling-closeout-2026-08-03.md)）· G6-2 ✅（[closeout](app/.progress/g6-2-automation-placeholder-closeout-2026-08-03.md)）· G6-3 ✅（[closeout](app/.progress/g6-3-test-net-closeout-2026-08-03.md)）· **G6-6 ✅（[closeout](app/.progress/g6-6-pi-ui-honest-closeout-2026-08-03.md)）** · **G6-8 ✅（[closeout](app/.progress/g6-8-slow-log-closeout-2026-08-03.md)）** · **G6-4 ✅（[closeout](app/.progress/g6-4-sweeper-atomic-closeout-2026-08-03.md)）** · **G6-10 ✅（[closeout](app/.progress/g6-10-inbox-observability-closeout-2026-08-03.md)）** · **G6-9 ✅（2026-08-03，[closeout](app/.progress/g6-9-embedder-test-closeout-2026-08-03.md)，全量 1540 用例绿）** → 池内剩余按 §3 价值取用（G6-5 分页 / G6-7 skipped 警示） |
| 18 | **第八波（前端体验第二波）：G7-1 → G7-2 → G7-3** | G7 | ✅ 已关（2026-08-04，[closeout](app/.progress/g7-frontend-wave-closeout-2026-08-04.md)：**G7-1…G7-12 全部 12 刀收官**——Sheet 后退关闭/返回不闪屏/Memory 15s 实时/transcript 虚拟化（120 条消息 run 实测 rendered 22/120）/Sheet 优先级+标签/新建表单可搜指派/Inbox Enter/Toast 上限+hover 暂停/页标题/分享链复制/colSpan/工具栏收纳；Playwright 17/17 PASS + 回归 6/6；全量 1546 用例绿（shared 121 + server 954 + web 471）） |
| 19 | **G8 可信执行 + 08-08 硬缺口合入** | G8 | ✅ 本波合入：G8-1…5a / G6-5 / G6-7 / envRef / Memory projectId / waiting 投影（文件已交织，一次提交） |
| 20 | **G8-6 加厚 + comment follow-up** | G8 | ✅（2026-08-19：[G8-6](app/.progress/g8-6-board-live-transcript-impl-1.md) · [enqueue](app/.progress/comment-followup-queue-impl-1.md) · [claim 串行](app/.progress/followup-serial-claim-impl-1.md)） |
| 21 | **Runs Mission Control 任务语义 + 定位** | G3 | ✅（2026-08-19，[closeout](app/.progress/runs-mission-control-subjects-impl-1.md)：服务端 subject / q / projectId + URL 搜索筛选 + 真实 Playwright） |
| 22 | **Issue run 区块真实性** | G3 | ✅（2026-08-19，[closeout](app/.progress/issue-runs-truthful-error-impl-1.md)：同一 runs query 下传；500 显示局部错误/retry，恢复后不新增 run） |
| 23 | **Chat 标题与安全删除** | G3 | ✅（2026-08-19，[closeout](app/.progress/chat-title-safe-delete-impl-1.md)：行内改名；仅 archived 且 zero-run 可删；有运行记录 409 保留） |
| 24 | **Worker tick 健康真实性** | G5 | ✅（2026-08-19，[closeout](app/.progress/worker-tick-health-truth-impl-1.md)：四 worker success/failure health、healthz/ops/Settings、Playwright；Vitest 4 worker 上限迁移以消除 WAL 并发假红） |
| 25 | **Issue 评论线程与结论 UI** | G3 | ✅（2026-08-19，[closeout](app/.progress/issue-comment-thread-conclusion-ui-impl-1.md)：一层回复、结论/撤销、折叠展开、真实 Playwright） |
| 26 | **Agents roster 当前任务可行动化** | G3 | ✅（2026-08-19，[closeout](app/.progress/agent-active-task-peek-impl-1.md)：bulk currentIssueRun、单 run Run detail、多 run active 筛选、真实 Playwright） |
| 27 | **Agent 详情直达派活** | G3 | ✅（2026-08-19，[closeout](app/.progress/agent-direct-issue-create-impl-1.md)：URL 创建意图、有效 Agent 预填、既有 readiness/preflight+enqueue、真实 Playwright） |
| 28 | **Automation Run Now 结果真实性** | G3 | ✅（2026-08-19，[closeout](app/.progress/automation-run-now-truth-impl-1.md)：严格领域结果分类、warning、非成功自动展开、真实 runtime-missing Playwright） |
| 29 | **Automation schedule catch-up truth** | G2 | ✅（2026-08-19，[closeout](app/.progress/automation-schedule-catchup-truth-impl-1.md)：24h latest-only、5 分钟过窗 skipped 审计、真实 worker + Playwright） |
| 30 | **Automation 规则归档保留历史** | G2 | ✅（2026-08-20，[closeout](app/.progress/automation-archive-history-impl-1.md)：删除变归档，执行证据保留） |
| 31 | **归档 Agent 派发硬闸与遗留收口** | G8 | ✅（2026-08-20，[closeout](app/.progress/archived-agent-dispatch-fence-impl-1.md)：统一归档 gate、历史取消、worker claim guard、真实 Playwright） |
| 32 | **CmdK 项目上下文直达** | G3 | ✅（2026-08-20，[closeout](app/.progress/cmdk-project-context-impl-1.md)：标题/描述/目录搜索、空查询导航、真实 Playwright） |
| 33 | **Squad 安全退役与派发闭环** | G2 | ✅（2026-08-20，[closeout](app/.progress/squad-retirement-dispatch-closure-impl-1.md)：DELETE=不可恢复归档+原子转交 leader+审计；loader 双语义；统一 squad_archived gate；rerun/auto-retry 无 squadId；归档详情只读 UI；隔离 E2E 23/23） |

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
