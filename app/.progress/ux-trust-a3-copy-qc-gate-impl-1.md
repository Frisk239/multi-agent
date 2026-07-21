# UX Trust A3 — 文案与 QC 闸对齐

Date: 2026-07-21  
Branch: main  
Plan: `docs/superpowers/plans/2026-07-21-ux-trust-wave-a.md` Task 3

## 本刀范围

默认隔离语义写清：未配置工作区 **不** = 拒绝派活；仅 `MA_ISSUE_USE_WORKSPACE_CWD=1` 时 cwd 硬闸。QC 与 Issue 同级 readiness 闸。

## 决策

| 项 | 选择 |
|---|---|
| Settings cwd check | 未配置/坏路径：force workspace → error；否则 **warn** |
| EnvBanner cwd | 仅 error 时出现；标题改「已启用工作区 cwd，拒绝开工」 |
| QC | POST 前 `computeAgentReadiness`；cwd_missing/runtime_missing/error → **409** 不静默 queued |
| 旁路 | 仍尊重 `MA_ENQUEUE_ALLOW_NOT_READY` |

## 改动

- `routes/settings.ts` — cwd check 分级
- `routes/quick-runs.ts` — readiness 硬闸
- `EnvBanner.tsx` · `NewIssueForm` · `QuickDispatchPanel` · `SettingsPage` 文案

## 验收

| 项 | 结果 |
|---|---|
| typecheck | PASS |
| GET settings cwd | status=ok（本机已配 path）detail 含默认隔离说明 |
| Playwright Settings 工作区卡 | 含 `MA_ISSUE_USE_WORKSPACE_CWD` +「隔离」 |
| EnvBanner | 默认无 cwd 顶栏（cwd 非 error） |

## Wave A 出口

A1 绑项目预检 · A2 run cwd 展示 · A3 文案/QC 闸 — 用户可知「在哪跑 / 为何拦」。

## 下一刀

**B1** Chat 绑 Project / localPath。
