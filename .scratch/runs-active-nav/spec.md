# runs-active-nav

## 用户路径

运维在侧栏看到「运行」上的 **活跃 run 角标**（queued+running）→ 点进 `/runs?status=active` 看在途列表 → 与 Multica 任务在途可见对齐。

## Must

1. `GET /api/runs/active-count` → `{ count, queued, running }`
2. `GET /api/runs?status=active` → 仅 queued|running
3. 侧栏「运行」角标 + `data-testid="nav-runs-badge"`；有活跃时 href=`/runs?status=active`
4. Runs 页状态筛选含「活跃」；`data-status="active"`
5. WS run 生命周期 invalidate 活跃计数

## Out of scope

- 自动化 next-run 可读性（下一刀）
- 多 status 通用 CSV 筛选
