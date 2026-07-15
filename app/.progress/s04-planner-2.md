# Handoff: S04-planner-2（切片总结 + 收尾）

> 切片：`S04` · 角色：`planner` · 序号：`2`（切片收尾）
> 日期：2026-07-15
> 作者：S04 计划者主会话
> 分支：`feat/s04-squad`（已 push，16 commit）

## 上下文

S04（Squad 小队）是答辩 FRI-11 路径的核心体验段（★★★★★）。本文件是切片验收通过后的计划者收尾总结。

切片全流程：spec（`ce6997d`，两轮自审 R1-R7）→ plan（`7d32bf8`）→ impl-1 数据层（4 commit）→ 计划者验收 + 排雷 → impl-2 核心逻辑（5 commit，★核心重写）→ 计划者验收 → impl-3 前端+验收+审计修复（4 commit）→ **本文件**。

并行产出：跨切片代码审计（`5b1063a`，12 项发现，A1/A2 在 S04 内修复）。

## S04 切片验收结论：✅ 通过

### 验收清单（spec §9 逐条）

**§9.1 工程**
- [x] `pnpm -r typecheck` 三包全绿
- [x] `pnpm dev` server + web 起服务

**§9.2 squad→leader 路由**
- [x] 指派 squad → leader run is_leader=1, squad_id 填充，enqueue+claim
- [x] briefing 8 项检查全过（三段 + 三 worker mention + 不含 leader + 前置）

**§9.3 comment-trigger 闭环**
- [x] 含 @mention 的 comment → worker 并发 enqueue+claim（per-agent 槽）
- [x] 多 worker 并发（不同 agent 同时 running）

**§9.4 防自指 + 熔断**
- [x] leader@squad 自指跳过 / 非 leader@squad 放行 / status_change 跳过
- [x] issue run ≥15 → 熔断 system comment（label="系统"）

**§9.5 回归**
- [x] S01 看板 + S02 时间线/mention + S03 cancel 全不破坏

**§9.6 答辩路径**
- [x] FRI-11 指派产品小队 → leader run（队长徽标）→ 时间线 briefing + mention pill + worker 汇报

### 切片统计
- 16 个 commit（impl-1×4 + 计划者验收×2 + impl-2×5 + impl-3×4 + 审计报告×1）
- 3 个执行者会话（数据层 / 核心逻辑 / 前端+验收）
- 计划者排雷 5 个坑（循环 import / DRY / 无锁 / 补 import / Task 合并顺序），全部被 impl-2 按指引处理
- 跨切片审计 12 项发现，A1/A2（真实 bug）在 S04 内修复

### 关键技术成果
1. **squad→leader 路由**：不建独立 squad task 抽象，指派 squad = 解析 leader + 复用 agent_run（is_leader 标记）
2. **briefing 三段注入**：Operating Protocol + Roster（`[@Name](mention://agent/<id>)`）+ Mission Directive，claim 时前置
3. **comment-trigger 闭环**：comment 创建后解析 mention → 派发任务；防自指（@agent 放行 / @squad leader 跳过）；乒乓熔断（15 run 上限）
4. **RunWorker 并发改造（★核心重写）**：全局 busy → per-agent 槽（agent.concurrency）+ fire-and-forget 并发，无锁安全
5. **审计 bug 修复**：A1 终态竞态（终态 UPDATE 全加 WHERE status IN active）+ A2 system label

### 偏离记录（均已裁定可接受）
| 偏离 | 来源 | 处置 |
|---|---|---|
| Task 2.4+2.5 合并 | 排雷#1（循环 import 闭包必须同 commit）| 接受 |
| checkAndEnqueue 抽象 | 排雷#3 DRY | 接受，修正 plan 不一致 |
| AssigneeSelect 重写支持 squad | spec §5.1 R7 假设错误（原组件不能选 squad）| 必要纠正 |
| A1 修复范围扩展 | 三处终态全加条件（比只改 cancelled 更完整）| 接受 |

### 非阻塞遗留
- **真实 CLI mention 闭环未完整跑通**：claude-code backend（S03）stdin 问题（3s 后 `no stdin data`）导致 leader 跑不完。**非 S04 缺陷**——S04 代码逻辑用确定性方式全验证。留 S05 前置修 claude stdin
- **审计 B1/B3/B4/B5 未处理**（run:progress 前端不消费 / SquadDetail 无端点 / issue:created 预填 cache / runs 400）：属 S04 收尾或 S06+
- **opencode/cursor backend 卡住**：S03 backend 成熟度问题

## FRI-11 答辩路径点亮状态

| 路径段 | 状态 |
|---|---|
| 看板显示 FRI-11 | ✅ S01 |
| 时间线 + 评论 | ✅ S02 |
| 真实 agent 执行 | ✅ S03 |
| **Squad briefing + @mention 委派** | ✅ **S04 点亮**（确定性验证）|
| Skill + MCP | ⬜ S05 |

**S04 点亮了 squad 委派段。** 答辩路径现在：看板 FRI-11（产品小队）→ 详情时间线见 leader briefing（三段 + @mention pill）→ 指派触发 leader run（队长徽标）→ comment-trigger 派 worker → 时间线呈现委派链。

> **注**：真实 CLI mention 闭环（leader 产出 mention → 自动派 worker）需 S05 前置修 claude stdin 后才能完整 demo。当前用确定性方式（API + 脚本）验证了代码逻辑正确。

## 给 S05 切片的交接注意点

> S05 = Skill URL 导入 + MCP 配置（spec/plan 待 brainstorm）。

### 地基（可直接复用）
1. agent 的 runtime 绑定 + RunWorker 执行就绪
2. S04 的 briefing 注入可扩展（加 skill 信息进 roster 渲染）
3. shared 契约体系成熟，加 Skill 契约是增量

### S05 前置必做
1. **修 claude-code backend stdin 问题**：`claude -p <prompt>` 3 秒后报 `no stdin data`。可能是 argv 过长 + claude 仍等 stdin。建议改 stdin pipe 传 prompt，或调 argv 长度。这影响 S04 的真实 CLI mention 闭环 + S05 的 skill 实际执行验证
2. **brainstorm S05 spec**：Skill URL 导入 + 按 agent 分配 + MCP 配置。参考 seed.js 的 skills[] 数据结构 + hermes Footprint Ladder

### 审计遗留（可选在 S05 或 S06+ 处理）
- B1 run:progress 前端不消费（下沉为 server-only 或加流式 UI）
- B3 SquadDetail 无端点（补 GET /api/squads/:id 或降级为内部类型）
- B4 issue:created 预填 cache（只更新列表 cache）
- B5 GET /api/runs 无 issueId 返回 400

## 合并建议

1. 按 AGENTS.md 单人 PR 规则，开 PR：`feat/s04-squad` → `main`
2. 新会话审 diff（无上下文偏见）
3. 审查通过 → 人在 main 合并（普通 merge）
4. 合并后 S05 起会话 brainstorm
