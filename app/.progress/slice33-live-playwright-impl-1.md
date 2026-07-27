# Slice 33 · 全栈 live Playwright 补验（Phase B V1）· closeout

> 切片：`slice33-live-playwright` · 角色：`owner/impl` · 日期：2026-07-27  
> 计划：[slice-plan-2026-07-27-phase-b.md](./slice-plan-2026-07-27-phase-b.md) · V1 验收锁回归

## 上下文

Phase B 第零波：在真起本地 WEB/SERVER 下把 23–32 主路径锁成可重复跑的 Playwright 基线。  
**不启服脚本内嵌**；默认假设 `localhost:3000` + `localhost:3001` 已就绪。派活路径用 **API create issue + enqueue**（真 CLI 非强制，Out 对齐）。

## 本会话完成了什么

| 路径 | 内容 |
|---|---|
| `app/packages/server/scripts/e2e-slice33-phase-b-baseline.mts` | live Playwright 基线脚本；导出 `SLICE33` selector/URL 常量 |
| `app/.progress/logs/slice33-phase-b-baseline-*.log` | 运行日志（本刀证据） |
| 本 closeout | Must 勾选 + PASS/FAIL/SKIP 表 + 下一步 |

## Must 勾选

1. [x] **派活→run 出现→状态推进** — API `POST /api/issues`（assignee=`agt-lead`）→ `enqueue.status=queued` + `runId` → `GET /api/runs` 见 `status=running`（真 CLI 非强制；本环境实际进入 running）
2. [x] **看板 `?issue=` Sheet 开合** — 深链打开 `[data-testid=issue-side-sheet]`，Esc 关闭并清 query
3. [x] **WS 连上后列表 invalidate 可观测** — 侧栏 `.ws-chip` → **open**（作为证据之一）
4. [x] **Settings 健康卡可读** — `/settings?tab=health` 健康 section/testid 可见
5. [x] **失败如实记** — 可选 settings 子端点 404 记 **SKIP**；无硬失败不粉饰
6. [x] **closeout 附命令与日志路径**

## 命令

```bash
# 前置：WEB@3000 SERVER@3001 已起（本机实测 HTTP 200）
# 若未起：在 app/ 下 pnpm dev（或分别起 packages/web 与 packages/server）

cd app/packages/server
npx tsx scripts/e2e-slice33-phase-b-baseline.mts
```

可选环境变量：`WEB` / `SERVER`（默认 `http://localhost:3000` / `http://localhost:3001`）。

## 自测结果（证据）

**最近一次全绿运行：**

```text
WEB=http://localhost:3000 SERVER=http://localhost:3001
log=D:\code\multi-agent\app\.progress\logs\slice33-phase-b-baseline-2026-07-27T02-49-13-446Z.log

[PASS] service.web
[PASS] service.server
[PASS] api.runs (Must 5)
[PASS] api.settings.live-probes (Must 4/5)
[SKIP] api.settings.optional/api/settings/run-health — HTTP 404（端点可选）
[PASS] api.settings.optional/api/settings/health
[SKIP] api.settings.optional/api/settings/memory-health — HTTP 404（端点可选）
[PASS] ui.board.load (Must 2) — cardTitles=50
[PASS] ui.ws.chip (Must 3) — open
[PASS] ui.sheet.open / ui.sheet.close (Must 2) — Esc 关合
[PASS] ui.settings.health (Must 4)
[PASS] flow.create-issue (Must 1) — FRI-94 / id=b25b281c-...
[PASS] flow.enqueue (Must 1) — queued runId=c8a3f281-...
[PASS] flow.run-appear / flow.run-status (Must 1) — running

合计 PASS=14 FAIL=0 SKIP=2 WARN=0
结论: PASS
```

### PASS / FAIL / SKIP 表

| id | Must | 状态 | 说明 |
|---|---|---|---|
| service.web / service.server | — | PASS | 3000/3001 可达 |
| api.runs | 5 | PASS | GET `/api/runs` 200 |
| api.settings.live-probes | 4/5 | PASS | 200（stub 探针也算可读 API） |
| api.settings.optional/*run-health* | — | SKIP | 404 未实现 |
| api.settings.optional/*health* | — | PASS | 200 |
| api.settings.optional/*memory-health* | — | SKIP | 404 未实现 |
| ui.board.load | 2 | PASS | 看板加载 + 卡标题 |
| ui.ws.chip | 3 | PASS | open |
| ui.sheet.open / close | 2 | PASS | `?issue=` + Esc |
| ui.settings.health | 4 | PASS | 健康 section 可见 |
| flow.create-issue / enqueue / run-* | 1 | PASS | API 派活→queued→running |

## 实现说明（写清 mock/真 CLI）

- **派活路径：真 API + 本机 run-service enqueue**（非纯 mock HTTP）。
- **状态推进证据：run 行进入 `running`**；不要求 CLI 跑完终态，不强制云 CI 真 CLI（Out）。
- **WS：** 侧栏 chip `open` 作 invalidate 链路可观测证据；一直 `closed` 脚本记 **WARN** 不硬 FAIL。
- **Selector 常量：** `export const SLICE33`（可被后续刀 import）。

## 偏离

- 无新功能开发；未改产品业务代码。
- Settings 首次失败因数据未返回时 body 仅「加载环境诊断…」——脚本改为等待导航/section，属测试稳健性修复，非产品改动。

## 未做 / 债

- 未强制断言 React Query invalidate 的 network 日志（chip open 足够作 V1 证据）。
- 可选 settings 子端点 404 仍 SKIP，留给 Slice 40 运维叙事若补齐。
- 本刀创建的测试 Issue（如 FRI-93/94）可人工清理；未做自动硬删。

## 分支

- 工作区 `main` 直改（按 Slice Owner 约定）；本 closeout 不代 commit。

## 给下一 Owner

- 验收优先：重跑上述 `npx tsx` 命令，确认 FAIL=0。
- **默认下一刀：Slice 34 · 交互手感债收口（U4）**  
  三态/Error 中文/WS 断线可行动条/FocusTrap；Playwright 可扩本脚本一条断线条或详情骨架断言。
- 勿做：云 webhook / Redis / 密钥入库 / TipTap 全量。

## 下一 Owner 验收（intake）

- [ ] 读过本 closeout + phase-b plan Slice 33
- [ ] 命令可复核
- 结论：`通过` / `有条件通过` / `需返工`
- 债与风险：可选 settings 子端点 404；WS invalidate 未抓 request 日志
