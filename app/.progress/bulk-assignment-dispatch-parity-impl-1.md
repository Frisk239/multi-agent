# Closeout: bulk-assignment-dispatch-parity

日期：2026-08-20
产品提交：`f54546d feat(issues): dispatch bulk assignments`

## 已交付

- `POST /api/issues/bulk-assign` 不再只改卡片字段。它先对完整 target 做与单条指派一致的存在性、squad leader 与 readiness preflight；失败时在进入写事务前返回 4xx，因此不会留下半批 Issue、activity 或 run。
- 事务只写实际改变的指派和 activity；提交后每张改变的 Issue 都发布 `issue:updated`，并走共享的通知/派发决策。回执包含 `updatedCount`、`enqueuedCount`、`skippedCount`、`notApplicableCount` 以及仅对真实变化卡的逐项 enqueue/skip 证据。
- 批量入口绝不传取消 hook：已有 queued/running run 保持不动。单条 `PUT /api/issues/:id` 仍显式传 hook，保留既有“改指派会取消旧 active work”的独立语义。
- 看板批量 toast 不再把 HTTP 200 伪装成全都开工，而是分别报告“已更改”“已入队”“未启动原因”；unassign 明确为“未创建新 run”，不暗示取消原有工作。
- 新增隔离 current-source Playwright，随机 fixture agents 的 concurrency=0，强制 e2e DB、非默认端口、CORS 与服务归属检查；从看板多选到两条 queued run，检查旧 running run 未变、无 CLI，并 finally 清理。

## 参考与决策

- 对齐 Multica batch issue update 复用 `validateAssigneePair → WillEnqueueRun → dispatchIssueRun` 而非自行复制派活逻辑：`references/repos/multica/server/internal/handler/issue.go:3432-3473`。
- 本仓原批量 handler 只在事务中写 assignee/activity，而单条路径有 readiness、event、通知和 enqueue，导致“已指派”不等于“已派活”。选择抽出 target preflight 与单 Issue dispatch helper；其中 cancel 由调用方显式决定，消除 batch 误杀在途工作这一风险。

## 验收证据

- 真实 SQLite/Fastify 覆盖两卡入队+事件、invalid target/no-leader/readiness 事务前零半写、unassign not-applicable、bulk 保留旧 running run、单条仍取消、及新目标已有 pending run 时如实返回 `already_active` skipped 回执。
- Owner 用 migrated+seed 的隔离 SQLite 实跑 current-source Playwright：Server `:3002`、Web `:3003`，看板多选两张随机卡，真实 POST 后得到两条 queued run，原 running run 保留，concurrency=0 防止 worker/CLI 启动，服务已停止。
- `pnpm test` 通过：shared 133 tests、server 124 files / 1070 tests、web 81 files / 573 tests；shared/server/web direct TypeScript、E2E 静态 TypeScript、`node scripts/check-docs.mjs`、`git diff --check` 通过。

## 边界 / 工具链注记

- 不改 Issue status/priority、run 状态机、并发配额、scheduler、批量 retry/取消或 archive lifecycle；没有重定义单条改指派的取消语义。
- 仓库的 `pnpm typecheck` 仍因 Web package 的裸 `tsc` link 缺失而失败；本刀未修改依赖布局。使用既有 server TypeScript binary 对 web `tsconfig.json` 的 direct check 已通过，需单独作为工程工具链债处理。
- 下一刀由新一轮本仓×Multica 调研选定，优先继续封住“未来不可派发/历史可解释”类真实状态缺口。
