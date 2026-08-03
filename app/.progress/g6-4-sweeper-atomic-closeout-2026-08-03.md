# G6-4 Sweeper 收尸路径原子化 + 假批量注释修正 —— closeout（2026-08-03）

**刀名：** G6-4 Sweeper 收尸路径原子化 + 假批量注释修正
**Goal：** G6（后端执行与运营精细度）/ 第八波第六刀（§3 池按价值取用）

## 现状基线（开工前核对）

- `stale-runs.ts:536-610` `escalateFailedSquadRuns`：查询全部 squad member 终态 run → 内存 filter 已标记 → **逐条 UPDATE（无谓词，非原子）**；注释谎称「批量更新（减少 N 次 UPDATE 为 1 次）」「使用 IN 子句批量更新」（实际 N 条独立 UPDATE）——**假批量诚实性污点**（roadmap 原文）。且该函数**零测试覆盖**。
- `stale-runs.ts:620` `escalateDeferredUnclaimedRuns`：deferred activity 查重对每个候选各查一次 activityLogs（N+1）。
- 上游锚点：multica `agent.sql:569`（deep 引用 FailStaleTasks 行号，实际文件该处为 RequeueAgentTaskAfterClaimFailure）——「单条条件 UPDATE + 谓词 CAS」幂等形态，本刀对齐该形态（每条 UPDATE 带未标记谓词，重复扫描零重复副作用）。

## 落地改动

1. **escalateFailedSquadRuns 原子化**（`stale-runs.ts`）：
   - 候选查询直接带 `COALESCE(error,'') NOT LIKE '[Squad Escalated]%'` 谓词（DB 层过滤替代内存 filter）。
   - 逐条**条件 UPDATE**：`id + status IN (failed,timed_out) + 未标记谓词`；`changes=0` → 跳过不重发通知（学 multica 单条条件 UPDATE 幂等形态）。error 拼接依赖每行原文（failureReason/error），无法纯 SQL 批拼——**注释改为如实描述**（删假「批量更新」措辞）。
   - 通知/activity 只在 changes>0 后发出（与原「filter 已标记」语义等价且原子）。
2. **deferred 查重去 N+1**：`escalateDeferredUnclaimedRuns` 预查一次本批所有 issue 的 `run_deferred` activity → 内存 Set 判重（原对每候选各查一次）。
3. **测试盲区清零**：escalateFailedSquadRuns 零覆盖 → 新建 `stale-runs.escalate.test.ts`（真实迁移 DB）+4 用例。

## 测试与实证

- `stale-runs.escalate.test.ts`（新，真实 DB）：
  - 未标记才打标（error 前缀 + failureReason + activity 落库 + notify 一次）；已标记行原样不动
  - **幂等：二次调用 0 处理 0 通知**（条件 UPDATE 谓词挡住）
  - leader / 非 squad / running 均不处理
  - deferred 查重真实 DB 回归：已有 run_deferred activity 的 queued run 不重复升级（N+1 改预查后语义不变）
- `stale-runs.test.ts` drizzle mock 补 `sql` 桩（G6-4 谓词用 sql 模板，防未来用例崩）。
- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 940 + web 465 = 1526 全绿**（1522 + 4；server 全量连跑 3 次稳定绿）。
- 真机冒烟：dev server 热载新代码后 sweeper 每 tick `recoverStuckRuns` 正常（无错误输出）。

## 决策记录

1. **逐条条件 UPDATE 而非单条批量**：error 内容依赖每行原文拼接，SQL 单条无法表达；条件谓词保证原子幂等——「单条批量」不是目标，「无重复副作用」才是（multica 形态精神）。
2. **谓词下推 DB 层**：候选查询与 UPDATE 谓词一致，杜绝「查了→被并发改→误打标」窗口（本仓单进程下是防御性，但符合 DB 行即锁宪法）。
3. **注释诚实优先**：删「批量更新/IN 子句批量」假描述，如实写「逐条条件 UPDATE」——G6 目标「静默吞错/失真全部修正」的文本侧落地。

## 下一刀建议

§3 池剩余：**G6-7 Automation 连续 skipped 运营警示**（Settings 规则标黄 + 文案；可复用 G5-5 通知，价值低·中）· G6-5 分页 · G6-9 pgvector 测试（G1-5 已覆盖软回退，补 provider 选择直测）· G6-10 inbox 观测（activity-logger 已有 warn，补 inbox-writer 侧）。
