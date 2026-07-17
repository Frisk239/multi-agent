# Handoff: board-priority-triage-impl-1

> 切片：`board-priority-triage` · Slice Owner · 2026-07-17  
> 分支：`feat/board-priority-triage`

## 交付

看板/API **按 priority 分诊** + 详情 **可改 priority**（候选 B）。

### 契约 / API
- `ListIssuesQuery.priority`（`urgent|high|medium|low|none`）
- `GET /api/issues?priority=` 服务端过滤；可与 q/label/assignee 组合；非法值 400

### 前端
- `useIssues` 传 `priority`；看板 `?priority=` + select
- `IssueHeader` priority select（`UpdateIssueInput.priority`）

### 文档
- `.scratch/board-priority-triage/*`
- `app/.progress/issue-assignee-desk-intake.md`（上一刀 intake）
- `CONTEXT.md` 方位

## 证据

- `pnpm typecheck`：shared / web / server **全绿**
- API smoke（临时 DB）：
  - `priority=high` → FRI-05/09/11
  - 非法 `critical` → 400
  - `priority=high&assigneeType=agent&assigneeId=agt-prd` → FRI-09
  - PUT FRI-08 → urgent 后 filter 命中；已恢复
- **Playwright E2E**（`localhost:3000` + API `3001`，同源 localhost 避 CORS）：
  - 看板 priority=high → 3 卡 FRI-05/09/11；URL `?priority=high`
  - 标签 pill 产品 → FRI-09/11；`?label=lbl-product`
  - 侧栏「我的 issue」→ 6 卡；`?assignee=any`
  - 指派 未指派 → FRI-04/08；`?assignee=none`
  - CmdK `FRI-11` → 服务端 Issue 结果；Enter 进详情
  - 详情改 priority urgent → API 反映；看板 `?priority=urgent` 仅 FRI-11；已恢复 high
  - 看板搜索框 FRI-11（防抖 URL）
- 注意：用 `127.0.0.1:3000` 会 CORS 挡 `localhost:3001` API；E2E 须 `http://localhost:3000`

## 近期切片 E2E 复核（本会话一并做）

| 切片 | 路径 | 结果 |
|---|---|---|
| issue-labels | 看板 label pill / API labels | **通过** |
| issue-find | 看板 q、CmdK 服务端搜 | **通过** |
| issue-assignee-desk | 侧栏我的 issue / 未指派 select | **通过** |
| board-priority-triage | priority 筛 + 详情改 | **通过** |
| labels 软归档 | API POST+DELETE 临时标签 | **通过**（UI 归档确认未点） |

## 偏离

- 无功能偏离。

## 未做 / 债

- 详情标签「归档」按钮浏览器确认流未点  
- CORS：页面须与 API host 字符串一致（localhost vs 127.0.0.1）— 既有问题，非本刀引入  
- 多选 priority / 排序引擎 out of scope  

## 下一步（人）

1. push 已做则看 CI  
2. 远程合并 `feat/board-priority-triage`  
3. 勿 commit `wiki/` `*.db`  
