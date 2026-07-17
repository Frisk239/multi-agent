# 01 — Runs 列表 API + 人工 rerun/retry 编排

**What to build:** 放宽 `GET /api/runs`；实现 Multica 式人工再执行核心与 HTTP（Issue rerun + Run retry）；轻量失败分类（可先 server 内纯函数，供 UI 后续用或同响应附带）；shared Zod 契约。

**Blocked by:** None — can start immediately  

**Status:** resolved 

**Branch:** `feat/run-observability`（本票创建分支）

## Acceptance

- [x] `GET /api/runs` 无 `issueId` 返回列表（limit 默认+上限）；有 `issueId` 行为与旧客户端兼容  
- [x] 可选筛选：`status` / `agentId` / `kind`（按实现最小集，至少 `status`）  
- [x] `POST /api/issues/:id/rerun`：无 body → 当前 assignee/leader enqueue **新** run；`{ runId }` → 校验归属后按历史 agent enqueue  
- [x] `POST /api/runs/:id/retry`：`failed|cancelled` + 有 `issueId` → 新 run；`issueId==null` → **400**  
- [x] 不复活旧 run 行；与现有 enqueue 去重/cancel 策略对齐（run 级不误杀其他 agent）  
- [x] 失败分类纯函数至少覆盖 cwd / cli / stale|orphan / generic  
- [x] 可选：`rerunOfRunId` 可空列 + AgentRun schema；若过厚可记偏离并用事件兜底，但须在 handoff 写明  
- [x] `pnpm -r typecheck` 绿；API smoke 证据写在 ticket Comments 或 `app/.progress/run-observability-impl-1.md`  
- [x] 不 push main；不 commit `wiki/` `*.db`

## Implementation notes

- 单一编排入口，两 HTTP 共用（spec S3）。  
- 学 Multica：`RerunIssue` + `task_id`；**不做** auto-retry。  
- 参考：`run-service.ts`、`routes/runs.ts`、`routes/issues.ts`、shared `AgentRun`。

## Comments

（执行者开工/结束在此追加）
