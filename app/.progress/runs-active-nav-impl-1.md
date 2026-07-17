# Closeout: runs-active-nav

> 自动迭代 · main · 2026-07-17

## 交付

1. `GET /api/runs/active-count` → `{ count, queued, running }`
2. `GET /api/runs?status=active` → queued|running
3. 侧栏「运行」角标 `nav-runs-badge`；count>0 时 href=`/runs?status=active`
4. Runs 页状态筛选项「活跃」+ `data-status=active`
5. WS / retry / cancel / rerun invalidate `runs-active-count`

## 决策记录

- **选定本刀**（CONTEXT 建议 + Multica 在途任务可见）：侧栏活跃 run 计数，而非先做自动化 next-run。
- active = 复用服务端 `ACTIVE` 语义（queued+running），不引入新 DB 状态。
- 角标用蓝色 `nav-badge--active-runs`，与 Inbox 失败红区分。

## 证据

- `pnpm typecheck` 绿
- API：`/api/runs/active-count` 与 `?status=active` 与 seed running 对齐
- Playwright：
  - `/` → badge `1`，侧栏链接 `/runs?status=active`
  - `/runs?status=active` → `data-status=active`，filter=active，1 行 running

## Multica 对照（短）

| 路径 | Multica | 我们 | 差 |
|---|---|---|---|
| 在途任务可见 | queue/running 任务感 | 侧栏 runs 角标 + active 列表 | 本刀已补 |
| 自动化可读 | autopilot next plan | 仅 lastPlannedAt | **下一刀建议** |
| 失败运营 | inbox/board | 已有 fail strip/filter | 够用 |

## 偏离 / 债

- 无
- 临时 seed run 已删；勿 commit `wiki/` / `*.db`

## 给下一 Owner

- 再下一刀建议：**automation-next-run**（规则卡片展示下次计划时刻 / 可读调度摘要）
- 或补侧栏「工作中」与 active runs 是否联动（当前 workingCount 仍是 issue 状态）
