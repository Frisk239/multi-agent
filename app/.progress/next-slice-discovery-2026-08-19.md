# 下一刀发现：Agent 派活与自动化事实表达（2026-08-19）

只读调研；排除已关闭的 Runs Mission Control、Issue runs truth、Chat lifecycle、Issue 评论线程结论，以及进行中的 `agent-active-task-peek` / worker health truth；不含 G8-4b 与 Pi extension UI。

## 推荐排序

| 顺位 | 垂直切片 | 类别 | 厚度 |
| --- | --- | --- | --- |
| 1 | Agent 详情页「分配工作」直达预填新建 Issue | 前端高频路径 | S |
| 2 | Automation「立即执行」按领域结果诚实反馈 | 运营真实性 + 前端 | XS/S |
| 3 | Automation 本机离线后的 latest-only 漏班审计 | 后端/运营 | M |
| 4 | Settings 自动化最近错误直达对应规则/执行记录 | 运营 UX | S/M |

## 1. Agent 详情页「分配工作」直达预填新建 Issue

**结论。** 当前动作名是“分配工作”，实际只打开“已指派给该 Agent”的看板筛选；操作者仍须点新建并再次选择同一 Agent。Multica 的 Agent 详情页直接打开带 `agent_id` 的 quick-create。

- Multica：`references/repos/multica/packages/views/agents/components/agent-detail-page.tsx:262-290,481-485`（`assign work` 打开 `quick-create-issue` 并传入 Agent）。
- 本仓：`app/packages/web/components/AgentDetailPage.tsx:509-516`（动作链接到 `/?assignee=agent:...`）；`app/packages/web/components/NewIssueForm.tsx:130,279-299,327-350`（已有 URL 打开、受控 assignee state 和现成 CreateIssueInput 指派提交）。

**差异 / 影响。** Multica 让“选中谁就向谁派活”在同一动作完成；本仓把“查看历史指派”误标为“分配工作”，增加一次页面与一次重复选择，尤其会妨碍正在查看 Agent 当前工作后的后续派活。

**Must。**

1. 约定不和看板 `assignee` 筛选冲突的创建意图（如 `new=1&createAssignee=agent:<id>`），打开 New Issue 并预选该 Agent。
2. 继续复用现有 readiness / preflight 硬闸和 CreateIssueInput→enqueue 路径，不能因 URL 预填绕过它。
3. Agent 详情的主按钮改为该直达路径；保留清晰命名的“查看已指派 Issue”入口。
4. 关闭/重置仅清理创建意图，保留其他看板筛选语义。

**Out。** Squad 对等入口、Quick Dispatch、Chat 创建、readiness 策略和 DB/API 变更。

**Playwright。** 就绪 Agent → 详情页“分配工作” → New Issue 已展开且 assignee 为该 Agent → 填标题提交 → Issue/Run 表现为现有 queued/running 真相；另断言“查看已指派 Issue”仍到带 assignee 筛选的看板。

## 2. Automation「立即执行」按领域结果诚实反馈

**结论。** 后端会持久化 `skipped`、`pending_dispatch` 等非成功业务结果；前端却在 `failed` / `pending_dispatch` 之外把所有状态送进 `toastSuccess`，例如 run-only 因 Agent 离线而跳过时显示成功语气。

- Multica：`references/repos/multica/packages/views/autopilots/components/run-now-toast.ts:1-26`（只有 `issue_created|running` 是成功，`skipped` 为 warning）；`autopilot-detail-page.tsx:722-741`（按 run domain status 而非 HTTP 2xx toast）。
- 本仓：`app/packages/server/src/orchestration/automation-dispatch.ts:293-337`（readiness 不可用写 `skipped` + 原因）；`app/packages/web/lib/api/automation.ts:101-157`（其余状态落入 `toastSuccess`）；`app/packages/web/components/AutomationPage.tsx:89-159`（已有记录、错误与 linked Run 的呈现）。

**差异 / 影响。** Multica 不把 admission-blocked 当触发成功；本仓让操作者误以为立即执行已开工，之后只能自行展开记录找原因。

**Must。**

1. 抽纯结果分类：仅明确启动态成功；`skipped` warning（带原因）；`dispatching/retrying` 为进行中并给“查看最近执行”；未知状态为 error。
2. 保留既有 `pending_dispatch` 的 Issue/Settings CTA，且不改变 dispatch 幂等、自动重试或数据库状态机。
3. 若规则目标已知不可用，可利用当前已加载的 readiness 数据在“立即执行”前展示可理解的预警；不阻断 create-issue 模式产生持久审计卡。

**Out。** 不改 scheduler、重试策略、DB enum、Pi UI。

**Playwright。** seed 一个 `cwd_missing`/`runtime_missing` 的 run-only rule → `/automation` 点“立即执行” → 非成功提示含跳过理由/诊断入口 → 展开“最近执行”看到 `已跳过` 与原因；fixture 再覆盖 `dispatching` / 未知状态，断言绝不显示成功。

## 3. Automation 本机离线后的 latest-only 漏班审计

**结论。** 本仓的 `computeDuePlannedAt` 永远取“当前 grid / 当前前一条 cron”，不读取 `lastPlannedAt`；服务重启后会静默越过停机期间的计划点。它有幂等占位，但没有“补偿、明确跳过、为何跳过”的产品事实。

- Multica：`references/repos/multica/server/internal/scheduler/spec.go:23-38,118-129`（显式 `CatchUpMode` + 有界窗口）；`jobs_autopilot.go:220-225,261-313`（从上次 watermark 枚举、latest-only 折叠、过期 guard）。
- 本仓：`app/packages/server/src/orchestration/automation-dispatch.ts:62-92,419-422`（只算当前 due，随后覆盖 `lastPlannedAt`）；`automation-worker.ts:15-30`（每 tick 直接采用该 due）；`db/schema.ts:591-623`（已有 `(rule_id, planned_at)` 幂等 run 记录）。

**差异 / 影响。** Multica 把离线后“只取最新 / 过期不派”的选择做成明确、有界的调度语义；本仓虽注释 latest-only，却未基于 watermark 计算遗漏窗口，也没有审计解释。对本地常关开的控制台，这会让“上次计划 / 下次计划”看似连续，但中间作业消失。

**Must（推荐策略）。**

1. 保持 `latest_only`，绝不批量补跑；以 `lastPlannedAt` 计算停机窗口并设置固定上界。
2. 对窗口外或被折叠的计划点，落一条幂等 `skipped` automation run，原因明确为“本机未运行，按 latest-only 跳过”；窗口内最多派发最新一条。
3. Automation 最近执行复用现有错误列展示这条解释；手动“立即执行”仍是补做的显式入口。
4. 覆盖重复 tick/restart 不重复写、长期离线不积压、正常间隔不产生伪 skip。

**Out。** Redis/云 Cron、多节点、全量历史 replay、新队列或 webhook。

**Playwright。** 用测试 fixture 置旧 `lastPlannedAt` 后打开 `/automation` → 规则“最近执行”显示一条因本机离线跳过的计划记录 → 点“立即执行”可显式补做并进入原有 Issue/Run 链路；后端集成测试覆盖时间/幂等是主证据。

## 4. Settings 自动化最近错误可直达

**结论。** Settings 的运营快照已经返回精确 `ruleId/runId/error/at/source`，但 UI 只截断错误文本；操作者看到异常后需要手动在 Automation/Runs 中搜索。

- Multica：`references/repos/multica/packages/views/autopilots/components/autopilot-detail-page.tsx:138-204,722-741`（执行行保留状态、来源、原因与日志入口）。
- 本仓：`app/packages/server/src/ops-snapshot.ts:277-289,496-537`（精确 ID 已在 snapshot）；`app/packages/web/components/SettingsPage.tsx:1663-1672`（仅渲染文本）；`app/packages/web/components/AutomationPage.tsx:89-159`（已有 rule run / linked Run 深链）。

**Must。** Settings 错误改为带 `ruleId/runId` 的跳转；Automation 读取聚焦参数、自动展开且高亮那一条 run，继续复用 linked Run 入口。

**Out。** 新仪表盘、历史数据重建、webhook、自动恢复语义。

**Playwright。** seed failed automation run（含 linked run）→ Settings 点最近错误 → `/automation` 自动展开并高亮该记录 → 点 linked Run 至 `/runs?run=...`。

## 取刀建议

下一刀取 **#1 Agent 详情页直达派活**：与完成中的 `agent-active-task-peek` 同一高频操作面、复用完整后端派发契约、改动小且不会重叠 Runs/Chat 已关项。若要优先压运营误导，取 **#2**；#3 是下一条真正后端/调度语义刀，需单独做时间与重启幂等测试。
