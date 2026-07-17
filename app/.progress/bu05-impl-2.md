# Handoff: bu05-impl-2

> 切片：`补5` / `bu05` · 角色：`impl` · 序号：`2`  
> 日期：2026-07-17  
> 分支：`feat/bu05-automation`  
> worktree：`.worktrees/bu05-automation`  
> 前置：[`bu05-impl-1.md`](./bu05-impl-1.md) + [`bu05-planner-1.md`](./bu05-planner-1.md)（API 已齐）

## 上下文

补5 最小自动化（schedule + run-now）。本棒只做 plan **Task 4–5**（Web `/automation` + 导航 + 回归 + handoff），**不改** dispatch/worker/migration 0010 语义。  
真源：`docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md` §8、`docs/superpowers/plans/2026-07-17-bu05-automation.md` Task 4–5。

## 本会话完成了什么

### Task 4 — Web `/automation` + 导航

- `lib/api.ts` hooks：
  - `useAutomationRules`
  - `useCreateAutomationRule`
  - `useUpdateAutomationRule`
  - `useDeleteAutomationRule`
  - `useRunAutomationNow` — HTTP 201 即成功；`status=failed` 仍 toastError（看 `error`），不 throw
  - `useAutomationRuns(ruleId, limit)`
- 新建 `components/AutomationPage.tsx`：
  - 列表：enabled 开关（PATCH）、schedule 文案、assignee 标签、上次计划、立即执行 / 最近执行 / 删除
  - 新建表单：name、scheduleKind（interval|daily）、interval 5/15/30/60 或 dailyTime、assignee agent|squad、title/body 模板
  - 空态引导创建
  - 可选展开：最近 runs（status / source / plannedAt / issue 链接 / error）
- 新建 `app/automation/page.tsx` → 渲染 `AutomationPage`
- `Sidebar.tsx` 配置区：`自动化` icon=`automation` href=`/automation`
- `CommandPalette.tsx`：导航「自动化」→ `/automation`
- `globals.css`：toggle、assignee chip、run status pill、runs 展开区

### Task 5 — 回归 + 进度 + handoff

- `pnpm -r typecheck` 绿
- API 回归（PORT=3016，独立 `dev-bu05-smoke.db` + migrate + seed）
- 进度表 phase4b → 补5「实现中 / 待计划者验收」
- 本 handoff

## 自测结果

### typecheck

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

### API 回归（真实 server，`PORT=3016` + `DB_PATH=dev-bu05-smoke.db`）

| 调用 | 期望 | 结果 |
|---|---|---|
| GET `/api/issues` | 200 | 200 |
| GET `/api/wiki/pages` | 200 | 200 |
| GET `/api/memory` | 200 | 200 |
| GET `/api/inbox` | 200 | 200 |
| GET `/api/settings/status` | 200 | 200（本机 overall=blocked，无 CWD 等，与 UI 无关） |
| GET `/api/automation/rules` | 200 | 200 count=0 |
| POST `/api/automation/rules` | 201 | 201 |
| POST `.../run-now` ×2 | 201 success + 两张卡 | 201 success ×2，issueId 不同 |
| 非法 assignee `agt-nope` run-now | 201 failed | 201 failed，error 含「agent 不存在」，issueId=null |
| PATCH enabled=false 后 run-now | 201 success | 201 success（M6） |
| GET `.../runs` | ≥3 | 3 × success |
| GET issues originType=automation | ≥3 | 3 |

烟雾结束后已 `taskkill` server，**删除** `dev-bu05-smoke.db*`，**未 commit** `*.db` / `wiki/`。

### UI 人评建议（本会话未起 Next 全栈点点）

1. 侧栏配置区「自动化」→ `/automation` 见列表/空态  
2. 新建 interval 规则指派 `agt-lead`，标题 `巡检 {{date}} {{time}}`  
3. 「立即执行」→ success toast（含 issue 短 id）；再点一次第二张卡  
4. 展开「最近执行」可见 issue 链接 / failed error  
5. enabled 关后仍可立即执行  
6. Ctrl+K 搜「自动化」可达

## 与计划的偏离

- 无契约 / dispatch 语义偏离。  
- 列表用每规则独立 `<tbody>` 展开 runs（避免 React fragment key 问题）；合法 HTML。  
- run-now toast 放在 hook `onSuccess`（按 status 分 success/error），页面按钮不重复 toast。  
- 回归用独立 smoke DB；settings overall=blocked 因未设 `MA_WORKSPACE_CWD`（与补4 独立 smoke 行为一致，不挡本刀）。  
- UI 未做 Playwright e2e；API + typecheck 为证据。  
- 进度表标「实现中 / 待计划者验收」，未擅自勾「已合 main」。

## 遗留 / 计划者验收注意

- 请验收本文件（整刀 Task 4–5 + 回归；整刀补5 = impl-1 + impl-2）。  
- 分支 tip 应含 UI commit + 本 handoff commit。  
- 未做：Webhook、crontab 库、run_only、every_plan 回放、e2e 套件。  
- 勿 commit `wiki/`、`*.db`；不 push main。  
- 人评可 `PORT=3001` server + web 点侧栏自动化页。

## 验收结论（仅计划者填）

- [x] `/automation` + 侧栏 + Ctrl+K — page + NAV + cmdk  
- [x] 列表 enabled 开关 + 新建 interval|daily + 立即执行 toast（success/failed 区分）  
- [x] 可选最近 runs（issue 链接 / error）  
- [x] run-now 201 即使 failed；两次 run-now 两张卡；非法 assignee failed — handoff smoke  
- [x] typecheck；issues/wiki/memory/inbox/settings 200 — 计划者复验 typecheck  
- [x] 无 wiki/db 误提交 — status 仅 untracked wiki/  
- 结论：**impl-2 达标；整刀补5（Task 1–5）达标，允许开 PR 合 main**
