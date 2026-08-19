# Goal 连续迭代：后端参考调研（2026-08-19）

范围：只读核对当前 `app/packages/server`、Multica、Pi（Hermes 仅作边界复核）。目标是找出仍有日用价值的编排 / runtime / 运营缺口；不把已关 Goal、G8-4b、云 / daemon / Redis / 自造 Agent loop 重新开刀。

## 结论与推荐

**推荐下一刀：同 Agent × 同 Issue 的 follow-up 串行认领。**

刚完成的 comment follow-up 已保证「running 时再评会插入一条 queued follow-up」，但 worker 的 claim 闸只看 agent 总并发槽。只要该 Agent 的 `concurrency > 1`，且没有 `project_local` 路径锁恰好挡住，原 run 与 follow-up 可以同时变为 `running`；这与「当前 run 结束后自动接上」的用户承诺相冲突。Multica 把同 `(issue, agent)` 的串行限制放在 claim SQL，正好是本仓缺的最后一环。

其余两个候选都值得保留到后续队列：Pi 的交互请求目前被自动取消；Automation 的重启补偿尚未显式建模。它们均未碰路线图的刻意边界。

## 候选 1（推荐）：Follow-up 串行认领 + 可见等待原因

### 结论、差异与价值

Multica 在领取任务时用 `NOT EXISTS` 限制同一 Agent 的同一 Issue / chat scope 只能有一个 `dispatched|running|waiting_local_directory` task；不同 Agent 仍可并行。当前本仓已允许 running 时建一条 follow-up，但 worker 只按 Agent 的总 `concurrency` 判断能否 claim。因此「补一句要求 → 期待当前轮完成后接着做」在并发设为 2+ 时会变成两个 CLI 同时读写同一任务上下文，且在没有项目路径锁时没有兜底。

### 用户路径

Agent 正在处理 Issue → 人在评论里补充要求 → 看到“排队中的跟进，等待当前 run 完成” → 当前 run 终态后，follow-up 立即被领取；另一位 Agent 仍可在同 Issue 并行工作。

### Must

- 把同 `(issueId, agentId, kind=issue)` 的活跃 scope 检查放到 claim 原子守卫，而不是只在 enqueue 时去重。
- 保留现有语义：running 时最多一条 pending follow-up；不同 Agent 不被串行化；人工 rerun 的取消语义不变。
- 向 Run 投影提供明确的“等待当前同 Issue run”原因 / 被阻塞 run id，供 Sheet 和列表说明，而不是伪装成 runtime busy。
- 原 run 进入任一终态后唤醒 worker；follow-up 能按原优先级规则接续。

### Out

- 不做跨 Issue 串行、全局 mutex、worktree、或 mid-run stdin 注入；Pi 的 `steer` 保持其已有独立能力。
- 不把 path-lock 改成文件锁，也不改 Agent 总并发配额。

### 验证建议

- 真实迁移 DB：Agent `concurrency=2`、同 Issue 同 Agent 一条 running + 一条 queued follow-up；`tick()` 后后者仍 queued / 可解释等待，绝不启动第二个 executor。
- 将前者转 completed/failed/cancelled 后再 tick，后者恰好启动一次；另一 Agent 的同 Issue run 可同时启动。
- 回归 comment-trigger、rerun、path-lock、priority 和全局并发测试；Playwright 从 Issue Sheet 评论到 run 历史验证等待文案与接续。

## 候选 2：Pi extension UI 请求的人机接力

### 结论、差异与价值

Pi RPC 已定义 `select` / `confirm` / `input` / `editor` 的双向 UI request/response，并且 Pi 自己的 orchestrator 把请求交给宿主 handler、再把响应写回 stdin。当前本仓已经识别到该帧，却立即回 `{cancelled:true}`，只写一条 log。这是诚实且安全的无人值守降级，但控制台本身恰好是本地人机协作界面：有用户打开 Run Sheet 时，应能让人明确回答一次，而不是无条件损失这类工作流。

### 用户路径

Pi run 请求确认 / 选择 / 文本输入 → Run Sheet 变为“需要你的确认”，展示请求类型与安全提示 → 用户确认、拒绝或取消 → 同一个 Pi session 继续；超时、页面不可用或服务重启时 fail-closed，并给出重新执行路径。

### Must

- 仅 Pi、仅 `confirm|select|input|editor`；为活动 run 建 server-side interaction handle，API 响应经现有 RPC stdin 返回。
- 持久化最小且脱敏的审计元数据（请求类型、时间、状态），**不**把输入值或密钥写入 DB / transcript；WS + Run Sheet 呈现待答状态。
- 显式等待时限和 sweeper 语义：超时 / 重启 / handle 丢失必须取消或失败并留可行动说明，不能无心跳卡住。
- 其他 runtime 继续明示“不支持交互请求”，而非假装通用能力。

### Out

- 不做通用浏览器自动确认、远程协作、凭据收集、或为所有 CLI 虚构交互协议。
- 不改 G8-4b 的无副作用 adapter probe 禁开决定。

### 验证建议

- mock Pi RPC：收到 request → `waiting_user_input` 投影 / WS → confirm、cancel、超时三种 response；server 重启后 handle 不存在时 fail-closed。
- secret-scrubber 回归：输入值不会出现在 `run_message`、activity、日志或 API 历史。
- Playwright：Sheet 内完成确认，run 不离开当前上下文并继续产出。

## 候选 3：Automation 停机补偿策略与计划账本

### 结论、差异与价值

Multica 的 scheduler 把“该补几次”定义为 `CatchUpMode + CatchUpWindow + MaxPlansPerTick`，其 Autopilot cron hook 会从上个计划点枚举到现在、最多取最近一次，并用窗口拒绝过晚的任务。当前 worker 每 30 秒只计算单个 `computeDuePlannedAt(rule, now)`；虽有 `(rule_id, planned_at)` 幂等占位和 `lastPlannedAt` 字段，后者未参与计划枚举。因此笔记本休眠 / 服务重启后的补偿策略不可配置，也没有可审计的“过期跳过”说明。

### 用户路径

机器离线错过多个计划点 → 恢复后规则按明确策略执行：默认只补最近一次且在窗口内；可选“逐个补跑”但每 tick 有上限 → Automation 历史能说明补跑或因过期跳过，而不是看似从未发生。

### Must

- Rule 级持久化 `catchUpMode`（默认 `latest_only`）、有限 `catchUpWindow` 和 `maxPlansPerTick`；保留现有 `UNIQUE(rule_id, planned_at)` 赢家 / 占位后副作用顺序。
- 根据上一 plan / `automation_run` 从时间窗口枚举 cron、interval、daily-at 的 due plans；所有计划点保留 canonical `plannedAt`。
- `latest_only` 默认不补成一串旧任务；`every_plan` 必须是显式 opt-in 且有窗口 / 每 tick 上限；过期项留下轻量可见记录或规则级说明。
- 保留本地时区默认；若增加 per-rule timezone，作为同刀的可选 UX，不要求引入分布式 scheduler。

### Out

- 不做云 webhook、多节点租约、Redis、或把最小 Automation 重写成 Multica 全量通用 scheduler。
- 不自动把 `run_only` 的离线语义改成堆积执行（沿用已关 G2-2 的 skipped 原则）。

### 验证建议

- 纯 planner 覆盖：冷启动、停机跨多个 cron/interval 点、窗口外、latest-only、every-plan 上限、重复 tick 幂等。
- 集成：两次 worker tick / 重启模拟后，同一 `(rule, plannedAt)` 绝无双 Issue / 双 run；Automation 历史文案可区分补跑、跳过和派发失败。
- Playwright：规则详情显示下一次、最后一次与补偿结果；run-only 离线仍为 skipped。

## 关键一手证据（共 9 条）

| # | 来源 | 说明 |
|---|---|---|
| 1 | `references/repos/multica/server/pkg/db/queries/agent.sql:508-539` | Claim SQL 对同 Agent × scope 做原子 `NOT EXISTS` 串行，允许不同 Agent 并行。 |
| 2 | `app/packages/server/src/orchestration/run-service.ts:17,308-341` | 本仓运行中可插一条 queued follow-up，pending 去重不含 running。 |
| 3 | `app/packages/server/src/orchestration/run-worker.ts:149-224` | 当前 claim 只检查 Agent 总槽位，再直接转 `running`，没有同 Issue scope 守卫。 |
| 4 | `references/repos/pi/packages/coding-agent/src/modes/rpc/rpc-types.ts:230-275` | Pi 定义 typed extension UI request/response 的完整双向契约。 |
| 5 | `references/repos/pi/packages/orchestrator/src/rpc-process.ts:117-169` | Pi orchestration 示例将 request 交宿主 handler，并可写回 response。 |
| 6 | `app/packages/server/src/runtime/pi.ts:393-407` | 本仓目前收到 UI request 即回 cancelled，避免 unattended idle。 |
| 7 | `references/repos/multica/server/internal/scheduler/spec.go:23-41,118-129` | Catch-up 模式、窗口与每 tick 上限是独立调度契约。 |
| 8 | `references/repos/multica/server/internal/scheduler/jobs_autopilot.go:238-315` | Autopilot 以历史 plan 为锚、窗口限界、latest-only 折叠 missed slots。 |
| 9 | `app/packages/server/src/orchestration/automation-worker.ts:10-29`; `app/packages/server/src/orchestration/automation-dispatch.ts:62-92,418-421` | 本仓当前每 tick 只取一个 due，虽写 `lastPlannedAt` 但未以它枚举恢复计划。 |

## 已排除

- G8-4b 无副作用 adapter probe 仍为禁开；不把它包装成 runtime 健康刀。
- 云 webhook、daemon 1:1、多节点、Redis、密钥入库、worktree、TipTap / 图谱等均属于路线图 §5 的刻意边界。
- 重造 Hermes agent loop / Tool Registry 不符合“Backend adapter 驱动现成 CLI”的架构钉；现有 Memory、stream scrub、自动重试、deferred escalation、优先级、execution ownership、分页和 automation 占位已在 G1–G8 / G6 收束，不重复开刀。

## 不确定性

- 未真机触发 Pi extension，因此候选 2 的实际触发频率取决于本机 Pi extensions；协议与当前自动取消路径已可核实。
- 候选 1 未在此只读调研中跑反例，但在 `concurrency > 1` 的代码条件下可静态推出；应以推荐刀的 DB 集成测试钉死。
- 候选 3 的默认产品裁决建议维持 `latest_only`，避免本地电脑恢复后任务风暴；是否暴露 `every_plan` 给 UI 可由 Slice Owner 依当前日用场景取舍。
