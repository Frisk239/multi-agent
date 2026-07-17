# Handoff: bu04-planner-0

> 切片：`补4` / `bu04` · 角色：`planner` · 序号：`0`（开工）  
> 日期：2026-07-17

## 分工

计划者只计划/验收；执行者实现；**串行** impl-1 → 验收 → impl-2。

## 真源

- **spec（已批准）：** `docs/superpowers/specs/2026-07-17-bu04-settings-design.md`  
- **plan：** `docs/superpowers/plans/2026-07-17-bu04-settings.md`  
- **分支：** `feat/bu04-settings`  
- **worktree：** `.worktrees/bu04-settings`

## 建议时机

- 优先：`origin/main` 已含补3 再开（减少并行分支噪音）  
- 无硬依赖补3；可从含补2 的 main 开工  

## 棒次

| 棒 | Tasks |
|---|---|
| impl-1 | 1–2 shared + GET /api/settings/status |
| impl-2 | 3–4 /settings 页 + 导航 + 回归 |

## 给执行者 impl-1（复制块）

```
你是补4（bu04）执行者 impl-1。只做 plan Task 1–2，不做 Web UI。

必读：
1. AGENTS.md
2. docs/superpowers/specs/2026-07-17-bu04-settings-design.md
3. docs/superpowers/plans/2026-07-17-bu04-settings.md（Task 1–2）
4. app/.progress/bu04-planner-0.md

环境：
- 从 origin/main 建 feat/bu04-settings
- worktree：.worktrees/bu04-settings
- 无 migration；不 push main；不 commit wiki/*.db

交付：
- shared SettingsStatusResponse
- GET /api/settings/status（G0：无密钥；cwd error → overall blocked）
- typecheck + smoke → bu04-impl-1.md
- push origin feat/bu04-settings

结束：请计划者验收 bu04-impl-1.md
```

## 给执行者 impl-2（impl-1 验收后）

```
你是补4（bu04）执行者 impl-2。做 plan Task 3–4。

必读 plan Task 3–4 + bu04-impl-1.md + bu04-planner-0.md。
同分支 pull；Settings 页 + 侧栏/cmdk；无表单写 env；回归 bu04-impl-2.md；push。
结束：请计划者整刀验收。
```
