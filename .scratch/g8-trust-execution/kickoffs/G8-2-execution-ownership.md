# 执行者 Kickoff · G8-2 崩溃后 CLI execution ownership

把下面「启动提示词」整段复制给实现用 AI / 执行者会话。

---

## 启动提示词（复制从下一行开始）

```
你是本仓实现执行者（非计划者）。工作区：multi-agent 仓库根。

## 角色与铁律
- 只实现本刀 Must；安全优先于「自动杀干净」。
- 遵守 AGENTS.md：纯本地单进程；不引入 Redis/多节点。
- **绝对禁止**：仅凭可复用 PID 盲杀无关进程。
- 回传证据；不自称计划者已验收。

## 本刀：G8-2 · 崩溃后 CLI execution ownership
规格：`.scratch/g8-trust-execution/spec.md` §G8-2  
背景审计：`app/.progress/hard-gap-audit-2026-08-08.md` §7、文末「仍保留后续」

### 问题
- `run-control.ts` / `process-tree.ts` 的 Abort 与 PID 是**内存 Map**，崩溃即丢。
- `recoverOrphanedRunningRuns`（`stale-runs.ts`）只把 DB `running` → `failed: orphan...`，**不杀**可能仍在改仓的 CLI。
- `agent_run` 无持久 pid/启动身份 → 路径锁只看 DB running，幽灵写盘可与新 run 并发。

### Must
1. 为执行中 run **持久化** ownership 记录，至少：`runId`, `pid`, 可验证的启动指纹（如进程 start time / create time / 命令摘要 / boot 世代之一或组合）, `cwd` 摘要, 写入时刻。实现可选：
   - A) `agent_run` 新列 + migration，或
   - B) 侧车文件/表 `run_execution_owner`（更易演进）
   选最贴本仓 Drizzle 风格的方案；有 migration 就走既有 drizzle 流程。
2. spawn 成功时登记；进程正常结束时清除。
3. 启动恢复（接入 `recoverOrphanedRunningRuns` 或紧邻调用链）：
   - 身份**可确认**为上次本产品拉起的孤儿 → `killProcessTree`（复用 `process-tree`）+ DB failed，failure 原因可区分（如 `orphan_killed` / 明确文案）。
   - 身份**不可确认**（PID 复用、进程消失但指纹不符、无记录）→ **不杀**；标 `unknown_external_execution`（或等价 enum/文案）+ 写 activity/inbox/ops 可观测提示（至少 logger.warn + 一处用户可见：Settings/Inbox/Run 之一）。
4. 单测覆盖：可确认杀 / 不可信不杀 / 无 owner 记录仍安全收尸。
5. 更新 `run-control.ts` 头注释，写清崩溃语义（与 G5-4 兼容并扩展）。

### Out of scope
- 多机、daemon、Redis lease
- Git worktree
- 改变 path-lock 的「同目录串行」产品默认（若孤儿存在是否挡 claim：优先文档化 + 告警；**不要**用不可信 PID 挡死整个队列除非有把握）

### 建议阅读
- `app/packages/server/src/orchestration/run-control.ts`
- `app/packages/server/src/orchestration/stale-runs.ts`（recoverOrphanedRunningRuns）
- `app/packages/server/src/runtime/process-tree.ts`
- `app/packages/server/src/db/schema.ts` agent_run 段
- Multica 思路仅作设计参照：`references/deep/multica.md` lease 段——**不要**移植 daemon 协议

### 验收（自测写入回报）
- [ ] 测试：可确认 orphan → kill 路径被调用（可 mock）
- [ ] 测试：PID 复用/指纹不符 → 不 kill
- [ ] server 相关 test 绿；typecheck 绿
- [ ] 注释/失败文案诚实

### 回报格式
1. 选型 A/B 与 schema 变更说明
2. 文件列表
3. 测试命令与结果
4. 已知限制（Windows vs POSIX 差异务必写明）
5. 计划者验收步骤

完成后停。默认 commit message 建议：`feat: persist run execution ownership for crash reconcile`（是否 commit/push 听从计划者/仓库惯例；若 main 直推授权有效且自测绿，可 commit，**push 前在回报里说明**）。
```

---

## 计划者验收清单（G8-2）

- [ ] 有持久 ownership，非纯内存  
- [ ] 可确认才杀；不可信不杀  
- [ ] 测试证据  
- [ ] 无盲杀逻辑  
