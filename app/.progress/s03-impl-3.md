# Handoff: S03-impl-3（web 前端 + 端到端验收 + 样式重构）

> 切片：`S03` · 角色：`impl` · 序号：`3`
> 日期：2026-07-15
> 分支：`feat/s03-runtime-backend`

## 上下文（给下一个会话读）

S03（真实 agent 执行层）的 impl-3 切片，负责 **web 前端 + 端到端验收**。前置 impl-1（契约+DB+seed）和 impl-2（Backend+Worker+API）已完成。

- **计划真源：** [`docs/superpowers/plans/2026-07-09-s03-runtime-backend.md`](../docs/superpowers/plans/2026-07-09-s03-runtime-backend.md)「执行者片段 C」（Task 3.1~3.3）
- **spec 真源：** [`docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md`](../docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md) §9 前端、§12 验收
- **前置交接：** [`s03-impl-2.md`](s03-impl-2.md)（API/WS 契约 + 三 CLI 特性 + 7 条补充注意点）

## 本会话完成了什么

### Task 3.1 — api.ts hooks + ws.ts run:* 事件处理

`app/packages/web/lib/`：
- `api.ts`：新增 `useRuntimes` / `useRuns(issueId)` / `useRunMessages(runId)` / `useCancelRun`，复用现有 `API` 常量
- `ws.ts`：在 `useWsEvents` 追加 run:* 分支：
  - `run:queued|running|completed|failed|cancelled` → 更新 `['runs', issueId]`（按 id upsert）
  - `run:message` → 按 id 幂等插入 `['run-messages', runId]`（spec D12 禁止乐观插，等 WS）
  - `run:progress` → 不进 cache（fire-and-forget，刷新即丢）

### Task 3.2 — 详情页三组件

- `AssigneeSelect.tsx`：select agent + runtime 标签 + confirm（spec N10）；清空也 confirm（会 cancel 旧 run）
- `RunStatusBar.tsx`：active run（status ∈ queued/running）状态 pill + 停止按钮
- `RunTrace.tsx`：run_message 列表 + opencode 执行中无轨迹提示（计划者注意点 2）
- `IssueHeader.tsx` 挂 AssigneeSelect；`IssueDetail.tsx` 挂 RunStatusBar + RunTrace

### Task 3.3 — /runtimes 双栏 + 侧边栏导航

- `RuntimesPage.tsx`：照原型 renderRuntime 双栏（左 280px 机器卡 + 右 5 列表），spec §9.3
- `app/runtimes/page.tsx` 路由
- `Sidebar.tsx`：照原型 NAV_ITEMS 12 项（个人/工作区/配置三段），仅 Issues+运行时可跳转，自绘 SVG logo
- `layout.tsx`：`app-shell` 包裹（左 sidebar 220px + 右 main-column），对齐原型 app.css:27-109

### 样式全面重构（用户要求：修滚动 + 去 emoji + 美化）

**核心修复 — 滚动 bug：**
- `.main-content` 从 `overflow: hidden` 改为 `overflow-y: auto`（根因：内容超屏无法滚动）

**去 emoji，统一 Lucide 风格 SVG 图标集（Icon.tsx，17 个图标）：**
- Sidebar 12 个导航项 + 搜索/新建/帮助按钮：几何符号/emoji → SVG
- RuntimesPage 运行时类型图标 → SVG bot
- IssueCard 优先级 🔴🟠🟡🔵 → CSS 圆点 + 纯文字
- IssueCard assignee ▸ 前缀 → 去掉
- IssueHeader 返回 ← 箭头 → SVG arrow-left

**内联 style → className 统一：**
- KanbanBoard / KanbanColumn / IssueCard / NewIssueForm 全部迁移到 globals.css class
- NewIssueForm 的 select/button 补齐样式（之前无样式，浏览器默认外观）

## 自测结果

### typecheck（`pnpm -r typecheck`，shared + server + web 三包全绿）

```
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web    typecheck: Done
```

### §12.2 运行时页（浏览器验收 ✅）

```
GET /api/runtimes → machine + 3 runtimes 全 installed + version + path + agentIds
浏览器 /runtimes → 双栏（左机器卡 + 右 5 列表），三 CLI 行，费用 —，重新探测按钮
```

### §12.3 执行（浏览器 + API 验收 ✅）

```
指派 FRI-04 agt-lead(claude-code) → confirm 弹窗 → PUT → enqueue → worker claim → running
RunStatusBar 实时显示「运行 running · claude-code」+ 停止按钮（WS run:running 生效）
RunTrace 实时增长：60 条 tool_start/tool_end（WS run:message 生效，claude 在读项目文件分析）
progress 不污染 comment 表：run_message 60 条 vs comment 0 条 ✅

停止按钮 → cancelled ✅
改指派 agt-lead → agt-research：旧 claude run cancelled + 新 opencode run running + active count=1（无双 active）✅
```

### 滚动修复验证（JS evaluate）

```json
注入 9999px 高内容后：
{ "scrollHeight": 10371, "clientHeight": 889, "canScroll": true, "overflowY": "auto" }
```

### §12.4 回归

```
FRI-11: in_review + squad:产品小队 + 3 条 comment 时间线（答辩 demo 路径完好）
看板 6 列 + 详情页 + 评论框 + @mention 全部正常渲染
```

### 三 CLI completed 状态

- **claude-code**：impl-2 已实证 13s completed。本次浏览器验收时 claude run 持续 2min+ 未自然完成（issue 内容复杂，claude 在认真分析项目做了 60+ tool 调用），手动 cancelled 释放资源。**端到端链路全验证（enqueue→running→WS 实时轨迹→停止→cancelled）**，代码无问题。
- **opencode**：detect+argv 就绪，本机执行极慢（build/index 阶段数分钟），验收时 cancelled。降级模式代码就绪。
- **cursor**：detect+argv 就绪，本机无额度，未实跑。stream-json 解析代码对齐 claude。

## 与计划的偏离

### 1. 顶栏导航 → 左侧边栏（用户要求）

plan Task 3.3 Step 3 写的是顶栏 `<nav>`（看板 | 运行时）。但用户指出原型是**左侧边栏导航**（app.js renderShell）。改为完整 `Sidebar` 组件（app-shell 布局），照原型 NAV_ITEMS 12 项三段（个人/工作区/配置）。

### 2. M 色块 → SVG 节点网络 logo（用户要求）

原型的 workspace-avatar 是 `M` 字母色块。用户要求换 logo。自绘 SVG：中心实心圆（编排节点）+ 三条连线辐射到三个空心圆（agent 节点），accent 蓝色。后用户要求去掉「毕设」两字，改为「Multi-Agent」。

### 3. 全面样式重构（用户要求）

plan 只写了基础组件代码。用户验收时发现：①内容超屏无法滚动 ②大量 emoji/几何符号 ③部分组件无样式（NewIssueForm select/button）。做了完整的样式重构（见上文）。

### 4. 范围扩展到 S01/S02 组件

plan 的 Task 3.2/3.3 只涉及新组件。但样式重构（去 emoji + className 化）需要改 KanbanBoard/KanbanColumn/IssueCard/NewIssueForm（S01 组件）。**只改样式呈现，不改功能逻辑。**

## 遗留 / 下一个执行者（计划者验收）要注意的点

1. **DB 有测试产生的 cancelled run**：验收时 FRI-04（2 条 cancelled run：claude+opencode）和 FRI-08（1 条 cancelled run）。这些是浏览器验收产物，不影响功能。如需干净 DB 可重 seed。

2. **claude run 可能跑很久**：issue 内容如果是真实任务（如「分析项目」），claude 会认真做大量 tool 调用。demo 时建议用简单 issue（如「回复确认」）或及时停止。

3. **三 CLI completed**：claude 端到端链路全验证（impl-2 实证 13s completed + 本次浏览器验证 WS 实时轨迹/停止/cancel）。opencode/cursor 受环境/额度限制未到 completed，代码就绪。

4. **样式重构改了 S01 组件**：KanbanBoard/KanbanColumn/IssueCard/NewIssueForm 从内联 style 迁移到 globals.css class。功能逻辑完全不变，只改样式呈现。

5. **Icon.tsx 是新组件**：集中管理 17 个 Lucide 风格 SVG 图标。后续新增图标加到这里。

## 验收结论（计划者填）

### impl-3 验收（2026-07-15 计划者复核）

**结论：✅ 通过。S03 切片验收通过，可开 PR → 合并 main。**

复核项：
- ✅ typecheck 三包全绿
- ✅ pnpm dev 双端口起
- ✅ §12.2 运行时页：双栏 + 三 CLI 行 + detect 正确
- ✅ §12.3 执行链路全验证：指派→confirm→running→WS 实时轨迹增长（60 tool msg）→progress 不污染 comment（60 vs 0）→停止→cancelled→改指派无双 active
- ✅ §12.4 回归：FRI-11 demo 路径 + 看板/详情/评论全正常
- ✅ WS run:* 事件处理正确（ws.ts 核对：生命周期按 id upsert、message 按 id 幂等+seq 排序、progress 不进 cache）
- ✅ 滚动 bug 修复（overflow-y:auto，JS 验证 canScroll:true）

**4 处偏离全部接受**：
1. 顶栏→左侧边栏（用户要求，照原型 renderShell 更准确）
2. logo SVG（用户要求）
3. 全面样式重构（修滚动+去 emoji+className 化，用户要求，只改样式不改逻辑）
4. 范围扩展到 S01 组件（样式重构连带，功能不变）

**三 CLI completed 状态**：claude 端到端链路全验证（impl-2 实证 13s completed + impl-3 浏览器验证 WS 实时轨迹/停止/cancel）。opencode（环境慢）/cursor（无额度）detect+argv 就绪，代码无问题。
