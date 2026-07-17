# Handoff: bu04-impl-2

> 切片：`补4` / `bu04` · 角色：`impl` · 序号：`2`  
> 日期：2026-07-17  
> 分支：`feat/bu04-settings`  
> worktree：`.worktrees/bu04-settings`  
> 前置：[`bu04-impl-1.md`](./bu04-impl-1.md) + [`bu04-planner-1.md`](./bu04-planner-1.md)（API 已齐）

## 上下文

补4 G0 Settings 只读环境诊断。本棒只做 plan **Task 3–4**（Web Settings 页 + 导航 + 回归 + handoff），**不改** `buildSettingsStatus` 语义 / overall·cwd blocked 规则。  
真源：`docs/superpowers/specs/2026-07-17-bu04-settings-design.md` §3、`docs/superpowers/plans/2026-07-17-bu04-settings.md` Task 3–4。

## 本会话完成了什么

### Task 3 — Web Settings 页 + 导航
- `lib/api.ts`：`useSettingsStatus()` — `queryKey: ['settings-status']`，`GET /api/settings/status`，`staleTime: 10_000`
- 新建 `components/SettingsPage.tsx`：
  - loading / error EmptyState + 重试
  - header：环境诊断 + overall 徽章（blocked 红 / degraded 黄 / ok 绿）
  - summary：`N 项错误 · M 项警告`
  - checks 稳定排序：error → warn → ok（同 status 保原序）
  - 行：status 点、label、detail、hint、有 `href` 时 Link「前往」
  - footer：只读说明（配置 env，无写密钥/表单）
- 新建 `app/settings/page.tsx` → 渲染 `SettingsPage`
- `Sidebar.tsx` config 区：`设置` icon=`settings` href=`/settings`
- `CommandPalette.tsx`：导航「设置」→ `/settings`
- `globals.css`：`.settings-overall*` / `.settings-check*` 诊断行样式

Commit：`3c9a18f feat(bu04): settings diagnostics page and nav`

### Task 4 — 回归 + 进度 + handoff
- `pnpm -r typecheck` 绿
- API 回归（PORT=3014，独立 `dev-bu04-smoke.db` + migrate）
- no-cwd inject：`overall=blocked`
- 进度表 phase4b → 补4「实现中」
- 本 handoff

## 自测结果

### typecheck
```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

### API 回归（真实 server 进程，`MA_WORKSPACE_CWD` 已设）

| 调用 | 期望 | 结果 |
|---|---|---|
| GET `/api/settings/status` | 200 + shape | 200；`overall=degraded`（本机无 WIKI_LLM → wiki_llm error；embed warn） |
| secrets | 仅 boolean | `{ wikiLlmConfigured:false, embeddingConfigured:false }` |
| 密钥泄漏 | 无 `sk-` / env 全文 | 扫描 body 无 |
| runtime 行 | `href=/runtimes` | claude/opencode/cursor 均为 `/runtimes` |
| cwd | ok（已设 CWD） | ok，detail= worktree 路径 |
| memory | available（真 init） | ok，`provider=sqlite-text` |
| GET issues | 200 | 200 |
| GET wiki/pages | 200 | 200 |
| GET memory | 200 | 200 |
| GET inbox | 200 | 200 |
| GET runtimes | 200 | 200 |

### no-cwd（inject，临时脚本未入库）
```
status 200
overall blocked
cwd status=error detail=未配置 MA_WORKSPACE_CWD
leak sk- false
```

### UI 人评建议（本会话未起 Next 全栈点点）
1. 侧栏配置区「设置」→ `/settings` 见 overall 徽章 + 排序后的检查行  
2. runtime 行「前往」→ `/runtimes`  
3. Ctrl+K 搜「设置」可达  
4. Network 面板确认 `/api/settings/status` 无密钥明文；页无表单写 env

## 与计划的偏离

- 无契约 / overall 语义偏离。  
- 回归用独立 `DB_PATH=dev-bu04-smoke.db`（默认 `dev.db` 缺表导致启动失败）；**未 commit** `*.db`。  
- UI 未做 Playwright e2e；API + typecheck 为证据。  
- 进度表标「实现中 / 待计划者验收」，未擅自勾「已合 main」。

## 遗留 / 计划者验收注意

- 请验收本文件（整刀 Task 3–4 + 回归）。  
- 分支 tip 应含：`3c9a18f`（UI）+ 本 handoff commit。  
- G0 未做：POST 写 env、密钥输入、Autopilot/补5、agent bulk readiness 摘要。  
- 勿 commit `wiki/`、`*.db`；不 push main。  
- 人评可 `PORT=3001` server + web 点侧栏设置页。

## 验收结论（仅计划者填）

- [x] `/settings` + 侧栏 + Ctrl+K — page + NAV + cmdk  
- [x] checks 排序 error→warn→ok；runtime 链 `/runtimes` — sortChecks + href  
- [x] 无表单写 env；footer 只读说明 — SettingsPage 只读  
- [x] GET status + 无密钥；无 CWD → blocked — handoff smoke 采信  
- [x] typecheck；issues/wiki/memory/inbox 200 — 计划者复验 typecheck  
- 结论：**impl-2 达标；整刀补4（Task 1–4）达标，允许开 PR 合 main**
