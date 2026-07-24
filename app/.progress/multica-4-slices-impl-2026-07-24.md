# 4 个厚垂直切片（Multica 体验对齐）关刀记录

**日期:** 2026-07-24  
**Commit:** `daa6846`  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + `git push origin main` 成功)

---

## 落实的 4 个厚垂直切片（Slices）

### 1. Slice 1: 运行事件深度解析与高保真时间线 (G23)
- **后端 Adapter 优化 (`claude-code.ts`)**: 在工具结束 (`tool_end`) 时填入 Tool 名称和结果，避免前端接收到无名工具。
- **前端解析库 (`lib/run-event-pairs.ts`)**: 增强 `pairRunToolEvents` / `parseToolName` / `parseToolPayload`，精准解析 `{"name": "...", "args": ...}` 和 `{"name": "...", "result": ...}`，并支持配对中的工具名自动回填（防止退化为 generic `"tool"`）。
- **时间线高保真渲染 (`RunEventTimeline.tsx`)**: 高亮标牌展示 Tool Name（如 Bash, ViewFile, WriteFile），工具参数与返回支持格式化折叠展现。

### 2. Slice 2: Inbox 报错一键私信追问与行动闭环 (G21)
- **Inbox 详情卡片 (`InboxPage.tsx`)**: 为失败或包含 Run 的通知添加了醒目的「带日志追问 (DM)」按钮。
- **上下文继承与追问**: 点击后唤起私信 Chat 抽屉，并带有提取失败日志 snippet 后的预填 prompt (如 `“上次运行 (Run <id>) 失败了，请分析报错：<error_snippet> 并给出修复方案。”`)。

### 3. Slice 3: Project 本地仓库 Git 探针与 Dirty 拦截闸 (G16/G20)
- **后端探针 API (`routes/projects.ts`)**: 新增 `GET /api/projects/:id/git-status`，通过 `git status --porcelain` 校验工程目录的 clean/dirty 状态与改动文件数。
- **派活安全闸 (`QuickDispatchPanel.tsx`, `ChatPage.tsx`, `IssueCardMenu.tsx`)**: 在快速派活、发送消息以及卡片指派 Agent 时检测目标 Project 干净程度；若状态为 `dirty`，显式弹框拦截确认防代码覆写。

### 4. Slice 4: PriorWorkDir 与进程级 Session 继承 (F12)
- **CWD 路径解析 (`resolve-run-cwd.ts`)**: 支持 `priorCwdPath` 与 `priorCwdMode`；重新执行 (rerun) 时直接继承上一轮的 Working Context 与隔离沙盒。
- **运行控制与日用日志 (`run-worker.ts`)**: 根据 `rerunOfRunId` 从历史 DB 提取工作区与 session，并在事件流中透出 `[session] Resuming environment from prior run <id>`，打通重跑体验闭环。

---

## 验证结论
1. `pnpm typecheck` 结果: **0 Error** (packages/shared, packages/web, packages/server 全部成功)。
2. Commit `daa6846` 已直接推送到 `main` 分支。
