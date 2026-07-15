# Handoff: S03-planner-2（切片总结 + 收尾）

> 切片：`S03` · 角色：`planner` · 序号：`2`（切片收尾）
> 日期：2026-07-15
> 作者：S03 计划者主会话
> 分支：`feat/s03-runtime-backend`（已 push）

## 上下文

S03（真实 agent 执行层）是平台第一个接通真实 CLI 执行的切片。本文件是切片验收通过后的计划者收尾总结。

切片全流程：spec（`78c5c6d`，自审 R1-R6）→ plan（`77472e8`）→ impl-1 契约+DB（5 commit）→ 计划者验收 → impl-2 Backend+Worker+API（5 commit，三 CLI spike）→ 计划者验收 → impl-3 web+端到端验收（6 commit）→ **本文件**。

## S03 切片验收结论：✅ 通过

### 验收清单（spec §12 逐条）

**§12.1 工程**
- [x] `pnpm -r typecheck` 三包全绿
- [x] `pnpm dev` server:3001 + web:3000 双端口起

**§12.2 运行时页**
- [x] 双栏（左机器卡 + 右 5 列表）
- [x] 三 CLI 行：installed/version/path/agentIds
- [x] 重新探测有效
- [x] 费用为 `—`

**§12.3 执行**
- [x] 指派 agent → confirm → 自动 run
- [x] progress 不刷 comment 表（60 run_message vs 0 comment）
- [x] run_message 实时可回放（WS run:message，60 条 tool 轨迹实时增长）
- [x] 停止 → cancelled
- [x] 改指派 cancel 旧 run；无双 active
- [x] **claude-code 端到端链路全验证**（impl-2 实证 13s completed + impl-3 浏览器验证）
- [x] opencode/cursor：detect+argv 代码就绪（环境/额度限制未到 completed）

**§12.4 回归**
- [x] S01 看板 + S02 评论/时间线/FRI-11 demo 路径不破坏

### 切片统计
- 21 个 commit（impl-1×5 + 计划者验收×2 + impl-2×5 + impl-3×6 + S04 spec/plan×3）
- 3 个执行者会话（契约+DB / Backend+Worker+API / web+验收）
- 计划者会话介入 2 次验收

### 关键技术成果
1. **三 CLI 真实驱动**：claude（stream-json）/ opencode（降级纯文本）/ cursor-agent（stream-json）。argv 全部 spike 钉死，有 multica 源码背书
2. **Windows 兼容**：.cmd shim 发现 + abort 死锁 5s 兜底（两个真实 bug，修复扎实）
3. **RunWorker**：主进程内 500ms tick + claim + backend.execute + 事件分流（progress 不进 DB，message 进 run_message）
4. **指派即跑**：PUT assignee=agent → enqueue → worker claim → execute → 终态 comment
5. **cancel**：POST /api/runs/:id/cancel（唯一入口）+ AbortController + taskkill /T /F

### 偏离记录（均已裁定可接受）
| 偏离 | 来源 | 处置 |
|---|---|---|
| cursor-agent 非 cursor --headless | spike + multica 确认 | 接受，回写 S04 plan 已知 |
| Windows .cmd shim | 真实 bug | 修复 |
| abort 死锁兜底 | Windows 必需 | 修复 |
| 顶栏→左侧边栏 | 用户要求（照原型更准）| 接受 |
| 全面样式重构 | 用户要求 | 接受（只改样式不改逻辑）|

### 非阻塞遗留
- opencode 本机执行慢（build/index 阶段数分钟）；demo 优先用 claude
- cursor 本地无额度；有额度后可直接跑
- DB 有验收产生的 cancelled run（FRI-04/FRI-08），不影响功能，合并前可重 seed 清理
- claude run 对复杂 issue 会跑很久（认真做大量 tool 调用）；demo 用简单 issue 或及时停止

## FRI-11 答辩路径点亮状态

| 路径段 | 状态 |
|---|---|
| 看板显示 FRI-11 | ✅ S01 |
| 时间线 + 评论 | ✅ S02 |
| **真实 agent 执行** | ✅ **S03 点亮** |
| Squad briefing + @mention 委派 | ⬜ S04（spec+plan 已就绪）|
| Skill + MCP | ⬜ S05 |

**S03 点亮了真实执行段。** 答辩路径现在：看板 FRI-11 → 详情时间线 → **指派 agent → 真实 CLI 执行 → 运行轨迹实时可见 → 终态汇报**。

## 给 S04 切片的交接注意点

> S04 = Squad 小队（leader briefing + comment-trigger + @mention 委派闭环）。**spec + plan 已全部就绪**：
> - spec：`docs/superpowers/specs/2026-07-10-s04-squad-design.md`（两轮自审 R1-R7）
> - plan：`docs/superpowers/plans/2026-07-10-s04-squad.md`（精确到 S03 落地行号）

S03 给 S04 留下的地基和待办：

### 地基（可直接复用）
1. **agent_run + RunWorker + 指派即跑**全就绪。S04 的 squad→leader 路由 = 解析 leader + 复用 enqueue（加 is_leader 标记）
2. **RunWorker 事件分流**已通（progress 不进 DB / message 进 run_message）。S04 的 briefing 注入只需改 buildPrompt
3. **comment 创建管线**已通（S02 POST + S03 终态 comment）。S04 的 comment-trigger 挂这两个入口
4. **WS run:* 事件前端处理**已通。S04 前端几乎零新增

### S04 必须处理的 S03 遗留
1. **RunWorker 并发改造（★核心重写）**：S03 是全局 busy 单 run 串行。S04 改 per-agent 槽（spec §6.2）。这是 S04 impl 最重的活
2. **enqueue 去重改 per-(issue,agent)**：S03 是 per-issue 单 active。S04 改 per-(issue,agent)（不同 agent 可并发）
3. **buildPrompt 签名加 run 参数**：S04 leader run 需 briefing 前置
4. **乒乓熔断**（spec R1）：issue run 总数上限 15

### S04 开工前提
**S03 必须先合并 main。** S04 从合并后的 main 切 `feat/s04-squad`。

## 合并建议

1. **合并前清理 DB**（可选）：删 dev.db* → migrate → seed，得干净 8 issue + 6 comment + 0 run
2. 按 AGENTS.md 单人 PR 规则，开 PR：`feat/s03-runtime-backend` → `main`
3. 新会话审 diff（无上下文偏见）
4. 审查通过 → 人在 main 合并（普通 merge）
5. 合并后 S04 即可开工
