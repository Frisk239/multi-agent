# runs-bulk-cancel

## 用户路径
运维在 Runs 列表看到多条在途（queued/running）→ 一键取消当前列表可见的在途 run → toast 报告成功数 → 列表刷新。

## Must
- shared：`CancelRunsManyInput` / response 契约
- server：`cancelRunsMany`（复用 `cancelRunById`）+ `POST /api/runs/cancel-many`
- web：`useCancelRunsMany` + Runs 页「取消在途」按钮（仅可见 active 时）
- 证据：typecheck + API smoke + Playwright 按钮可见

## Out of scope
- 任意跨页全库 cancel-all 无确认
- cwd 持久化 ADR
- heartbeat 指标面板
