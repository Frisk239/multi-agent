# Closeout: runs-bulk-cancel

## 交付
- shared：`CancelRunsManyInput` / `CancelRunsManyResponse`
- server：`cancelRunsMany`（复用 `cancelRunById`）+ `POST /api/runs/cancel-many`
- web：`useCancelRunsMany`；Runs 页顶栏按钮 + 在途 banner
- Spec：`.scratch/runs-bulk-cancel/spec.md`

## 证据
- `pnpm typecheck`：shared/server/web 绿
- API smoke：
  - seed 2× `running` → `POST /api/runs/cancel-many` → `{requested:2,cancelled:2,skipped:0}`
  - 空 ids → 400
  - 二次 cancel 同 id → `{cancelled:0,skipped:2}`
- Playwright：
  - `/runs?status=active` 可见 `runs-cancel-visible-active` / `runs-active-cancel-banner`
  - confirm 后 toast「已取消 2/2 条在途 run」；列表空态「当前没有在途运行」
  - API 状态均为 `cancelled`

## 决策
- 批量入口只取消**当前列表可见**的 active（queued/running），避免误杀全库
- 服务端逐 id 复用 `cancelRunById`，保证 abort + `run:cancelled` 事件一致
- 上限 100 ids，与 inbox bulk 量级对齐

## 偏离 / 债
- 无全库 cancel-all；无行级 checkbox 多选（可见列表一键足够）
- cwd 持久化 ADR、heartbeat 指标仍待

## Multica 对照
- Multica 有单 task cancel + stale fail；本刀补齐运维「批量取消在途」控制台路径
- 仍非 daemon 协议 1:1

## 给下一 Owner
- 建议：cwd 持久化 ADR（难逆→先文档）或 Settings heartbeat 可见性
- 勿 commit `app/packages/server/wiki/` / `*.db`
