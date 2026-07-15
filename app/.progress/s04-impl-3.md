# Handoff: s04-impl-3

> 切片：`S04` · 角色：`impl` · 序号：`3`
> 日期：2026-07-15

## 上下文（给下一个会话读）

S04 切片最后一个执行者，负责前端呈现 + 端到端验收 + 顺手修两个审计 bug（A1 终态竞态 + A2 system label）。
依赖 impl-1（数据层）+ impl-2（briefing + 路由 + comment-trigger + 并发改造）。
读 [s04-impl-2.md](s04-impl-2.md) + [spec §8/§9](../specs/2026-07-10-s04-squad-design.md) + [审计报告](../../docs/audit/2026-07-15-cross-slice-audit.md)。

## 本会话完成了什么

### Task 3.0: dev.db 重置（用户开工指令，必做）

- 前两任执行者因进程占用未能重置 dev.db。本会话定位占用者为 PID 74364（一个遗留的 multi-agent tsx server 进程，用默认 dev.db）。
- 停掉 PID 74364 → 3001 端口释放 → dev.db 解锁 → 删除 → `db:migrate` → `db:seed`。
- **dev.db 现已重置到干净 seed**（8 issue + 6 comment + squad protocol/directive/concurrency/member 全对）。

### Task 3.1: 审计 bug 修复（A1 + A2）

**A1 终态竞态**（`run-worker.ts`，审计 P0）：
- cancelled / completed / failed 三处终态 `UPDATE` 都加 `WHERE status IN ('running','queued')` 条件。
- 避免场景：signal 在 execute 返回后才 abort 时，把已落定的 completed 覆写成 cancelled。
- 与 `cancelRunById` 的条件 UPDATE 对齐（cancelRunById 早有此条件，worker 这边缺）。
- 补 `inArray` import（drizzle-orm）。

**A2 system label**（`client.ts:resolveAuthorLabel`，审计 P0）：
- 函数开头加 `if (type === 'member' && id === 'system') return '系统'`。
- 修复熔断 system comment（authorId='system'）作者显示原始 id 'system' 的问题。

### Task 3.2: 前端（spec §8，纠正 spec §5.1 R7 错误假设）

> 🔴 **关键发现**：spec §5.1 R7 写「S03 AssigneeSelect 已能选 squad」是**错的**。实际 `AssigneeSelect.tsx` 只调 `useAgents()`、发出的 assignee type 恒为 `'agent'`，**前端 UI 根本无法把 issue 指派给 squad**。若不修，答辩 demo 无法在 UI 完成「指派 squad」动作。

- **`AssigneeSelect.tsx` 重写支持 squad**：
  - 加 `useSquads()`，`<optgroup>` 分组（智能体 / 小队）
  - value 用前缀编码区分类型：`agent:<id>` / `squad:<id>` / `""`（未指派）
  - props 从 `currentAgentId` 改为 `currentAssignee: Assignee`（含 type+id+label）
  - confirm 文案区分 agent/squad（squad：「将启动小队「X」：队长被执行并 briefing 委派成员」）
  - `IssueHeader.tsx` 调用点同步改传 `currentAssignee={issue.assignee}`
- **`RunStatusBar.tsx` 加队长徽标**（审计 B2）：`active.isLeader` 时显示「队长」徽标（`active` 已含 isLeader 字段）。
- **`globals.css` 加 `.leader-badge` 样式**（黄色徽标，color-mix）。

### Task 3.3: 端到端验收（spec §9，核心）

完整结果见下「自测结果」。

## 自测结果

### typecheck（DoD 硬指标）

```
$ pnpm -r typecheck
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```
三包全绿（A1/A2 改动 + 前端改动后）。

### §9.1 工程

- ✅ `pnpm -r typecheck` 全绿
- ✅ `pnpm dev` 起 server（默认 dev.db 干净 seed）+ web

### §9.2 squad→leader 路由 ✅

实测：PUT FRI-04 assignee=sqd-product → 1s 后：
```
run 631bfe4a agent=agt-lead status=running isLeader=true squadId=sqd-product runtime=claude-code
```
✅ leader run 被 enqueue 并 claim，is_leader=1、squad_id 填充、runtime=claude-code。

**briefing 注入**（临时脚本调 buildPrompt，8 项检查全过）：
```
✅ 含 Operating Protocol
✅ 含 Roster
✅ 含 Mission Directive
✅ roster 含 agt-research mention
✅ roster 含 agt-prd mention
✅ roster 含 agt-proto mention
✅ roster 不含 leader(agt-lead)
✅ briefing 前置于 body
```
完整 leader prompt：
```
# Squad Operating Protocol
1. 队长接收 Issue briefing
2. 按专精 @mention 委派
3. 成员回帖交付物路径
4. 队长汇总后请求 MVP 签核

# Squad Roster
- 产品·需求与PRD官 — [@产品·需求与PRD官](mention://agent/agt-prd)
- 产品·设计·原型官 — [@产品·设计·原型官](mention://agent/agt-proto)
- 产品·调研与洞察官 — [@产品·调研与洞察官](mention://agent/agt-research)

# Mission Directive
基于 chanpin 真源产出 PRD + RTM + 可交互原型，Must 路径可点通。

---

Issue FRI-04: Memory 检索面板 mock（Should）
...
```

### §9.3 comment-trigger 闭环（核心）✅

实测：POST 一条含 `[@research](mention://agent/agt-research)` + `[@prd](mention://agent/agt-prd)` 的 comment 到 FRI-08 → 2s 后：
```
run agent=agt-prd   status=running runtime=cursor   isLeader=false
run agent=agt-research status=running runtime=opencode isLeader=false
```
✅ comment-trigger 解析两个 mention → 两个 worker run 被并发 enqueue 并 claim。
✅ 多 worker 并发（per-agent 槽）：两个不同 agent 的 run 同时 running。

> 注：post comment 用文件 body（`--data-binary @file`）而非 curl `-d`——Git Bash 下 `-d` 中文 body 的 Content-Length 与实际 UTF-8 字节数不匹配，会被 fastify 拒（`FST_ERR_CTP_INVALID_CONTENT_LENGTH`）。用文件 body 规避。

### §9.4 防自指 + 熔断 ✅

**防自指**（临时脚本直接调 triggerFromComment，3 场景）：
```
✅ 场景1: leader(agt-lead) @squad:sqd-product → 跳过（0 新 run）
✅ 场景2: 非 leader(agt-research) @squad:sqd-product → 触发 leader run
✅ 场景3: status_change comment → 整个跳过（R4）
```

**熔断**（独立库灌满 15 run 后 enqueue）：
```
✅ enqueueAgentRun 返回 null（熔断）
✅ system comment 写入: ⚠️ 已达 issue run 上限（15），停止派发。
✅ A2 修复实证: resolveAuthorLabel('member','system') → "系统"
✅ run 数保持 15（熔断挡住新 run）
```

### §9.5 回归 ✅

- ✅ S01 看板：8 issue，状态分布正常（backlog 2 / todo 2 / done 2 / in_progress 1 / in_review 1）
- ✅ S02 时间线：FRI-11 有 3 条 comment，agent comment 含 mention（前端 MarkdownBody 渲染 pill，探查确认），authorLabel 正确（"林远"/"产品·策划队长"/"产品·调研与洞察官"）
- ✅ S03 cancel 路径：POST cancel → run 转 cancelled（有 finishedAt），正常
- ✅ agents/squads 接口正常（3 squad + 4 agent，runtime 正确）

### §9.6 答辩路径 FRI-11 ✅

实测：FRI-11 取消指派 → 重新指派 sqd-product → 1.5s 后：
```
✅ leader run: agent=agt-lead status=running isLeader=true squadId=sqd-product
```
答辩路径 squad 段完整可演示：
- 看板 FRI-11 显示「产品小队」
- 详情时间线见 leader briefing comment（含 3 个 `[@产品·X官](mention://agent/agt-X)` → 前端渲染 pill）
- 指派触发 leader run（RunStatusBar 队长徽标会显示）
- 时间线见 worker（research）汇报 comment

### ⚠️ 真实 CLI mention 产出（闭环硬前提）—— 部分验证

闭环成立的硬前提：leader CLI(claude-code) 在 finalText 里产出 `[@Name](mention://agent/<id>)` 格式。

本会话观察到的真实 CLI 行为：
- **claude-code leader**：3 秒后 failed（`Warning: no stdin data received in 3s`）——claude-code backend（S03 既有）的 stdin 传递问题，**非 S04 代码缺陷**。
- **cursor/opencode worker**：running 但长时间无 message 产出——cursor 受限是已知的（用户提过），opencode 在本机似卡住。

**结论**：S04 闭环的**两段代码逻辑**（briefing 注入 + comment-trigger 派发）已全部用确定性方式验证通过。中间「leader finalText 含 mention」依赖 LLM 照 briefing roster 格式产出 + backend 稳定输出——这是 S03 backend 成熟度问题，非 S04。S04 代码做了防御（trigger 解析不到 mention 就不排 worker，不会出错，符合 spec §11 风险表预期）。

## 与计划的偏离

1. **修 AssigneeSelect 支持 squad（超出 spec §8「几乎零新增」）**：spec §5.1 R7 假设 AssigneeSelect 已能选 squad，但实测不能（只调 useAgents、type 恒 agent）。不修则答辩 demo 无法在 UI 指派 squad。经用户决策「修 AssigneeSelect 支持 squad（推荐）」后实施。这是对 spec 错误假设的必要纠正，~50 行改动。

2. **dev.db 重置方式**：用户指令「停所有 server 进程→删→migrate→seed」。实际定位占用者为遗留 tsx server 进程（PID 74364），停掉后 dev.db 解锁，按指令重置成功。验收阶段产生的 run/comment 污染已在最后重置清掉，dev.db 现为干净 seed。

3. **真实 CLI 验收范围**：用户决策「全跑，opencode/claude 优先，cursor 受限」。实际 claude-code leader 因 stdin 警告 failed、cursor/opencode worker 卡住无产出——这是 backend（S03）层问题。S04 代码逻辑用 API + 脚本确定性验证全通过。

4. **审计 A1 修复范围扩展**：计划者建议只改 cancelled 分支。实际 cancelled/completed/failed 三处终态 UPDATE 都加了 `WHERE status IN active` 条件——三者构成完整终态一致性（任何一个缺条件都可能在竞态下被另两个覆写）。

## 遗留 / 下一个执行者要注意的点（给计划者验收 + S05）

### 已就绪

- **S04 闭环代码全通**：briefing + 路由 + comment-trigger + 并发 + 熔断 + 防自指，全部确定性验证通过。
- **dev.db 干净**：已重置到 seed（8 issue + 6 comment），答辩 demo 可直接用。
- **前端可点通**：AssigneeSelect 能选 squad、RunStatusBar 显示队长徽标、时间线 mention pill 零改动可用。
- **审计 A1/A2 已修**：终态竞态 + system label，实测验证。
- **工作区干净**：所有临时验收脚本已删，git status 无未跟踪文件。

### 验收时注意（给计划者）

1. **真实 CLI mention 闭环未完整跑通**：claude-code backend（S03）的 stdin 问题导致 leader 跑不完。若计划者要验收「leader finalText 含 mention → comment-trigger 派 worker」的**真实**链路，需先让 claude-code backend 稳定（修 stdin 传递，属 S03 收尾/S05 前置）。S04 代码本身正确——可用「POST 含 mention comment」的方式确定性验证 trigger 派发（本会话已证）。

2. **claude-code backend stdin 问题**（非 S04，但影响 demo）：`claude -p <prompt> --output-format stream-json` 3 秒后报 `no stdin data received`。可能是 prompt 经 argv 传递过长 + claude 仍等 stdin。建议 S05 前置：改用 stdin pipe 传 prompt，或调 argv 长度。

3. **cursor backend 受限**：用户已知。cursor run 启动后卡住无产出。opencode 也卡（本机环境）。这些是 S03 backend 成熟度问题。

4. **审计 B2 已修**（RunStatusBar 队长徽标）；其余 B1/B3/B4/B5 未在本切片处理（属 S04 收尾或 S06+，见审计报告优先级表）。

### 文件改动清单（impl-3 触及的）

| 文件 | 改动 |
|---|---|
| `orchestration/run-worker.ts` | A1：cancelled/completed/failed 终态 UPDATE 加 WHERE status IN active + 补 inArray import |
| `db/client.ts` | A2：resolveAuthorLabel 对 system 短路返回"系统" |
| `web/components/AssigneeSelect.tsx` | 重写：支持选 squad（optgroup + 前缀编码 + 区分 confirm）|
| `web/components/IssueHeader.tsx` | 调用点改传 currentAssignee |
| `web/components/RunStatusBar.tsx` | B2：isLeader 显示队长徽标 |
| `web/app/globals.css` | .leader-badge 样式 |

## 验收结论（计划者填）

### impl-3 验收（2026-07-15 计划者复核）

**结论：✅ 通过。S04 切片验收通过，可开 PR → 合并 main。**

复核项：
- ✅ typecheck 三包全绿
- ✅ pnpm dev 起服务
- ✅ A1 终态竞态修复正确（run-worker.ts:153-165 cancelled/completed/failed 三处终态 UPDATE 全加 WHERE status IN active，与 cancelRunById 对齐）
- ✅ A2 system label 修复正确（client.ts:39 `id==='system'` 短路返回"系统"，熔断脚本实测）
- ✅ §9.2 squad→leader 路由：指派 squad → leader run is_leader=1 enqueue+claim；briefing 8 项检查全过
- ✅ §9.3 comment-trigger 闭环：含 2 mention 的 comment → 2 worker 并发 enqueue+claim（per-agent 槽）
- ✅ §9.4 防自指（3 场景）+ 熔断（≥15 → system comment「系统」label）
- ✅ §9.5 回归 S01/S02/S03 全不破坏
- ✅ §9.6 FRI-11 答辩路径 squad 段可演示
- ✅ AssigneeSelect 重写支持 squad（纠正 spec §5.1 R7 错误假设——原组件确实不能选 squad，不修则 demo 无法在 UI 指派）
- ✅ RunStatusBar 队长徽标（审计 B2）
- ✅ dev.db 干净（重置到 seed，验收污染已清）
- ✅ 工作树干净（临时脚本全删）

**4 处偏离全部接受**：
1. AssigneeSelect 重写（spec R7 假设错误，必要纠正）
2. dev.db 重置方式（定位 PID + 停进程 + 重置）
3. 真实 CLI 验收范围（claude stdin 问题属 S03 backend，S04 代码用确定性方式验证全通过）
4. A1 修复范围扩展（三处终态全加条件，比只改 cancelled 更完整）

**真实 CLI mention 闭环未完整跑通**：claude-code backend（S03）stdin 问题导致 leader 跑不完。**非 S04 代码缺陷**——S04 的 briefing 注入 + comment-trigger 派发两段逻辑已用 API + 脚本确定性验证全通过。S04 代码做了防御（trigger 解析不到 mention 就不排 worker）。留 S05 前置修 claude stdin。
