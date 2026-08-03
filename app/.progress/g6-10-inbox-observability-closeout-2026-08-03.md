# G6-10 inbox 写失败可观测 —— closeout（2026-08-03）

**刀名：** G6-10 inbox/activity 写失败可观测（不再静默吞）
**Goal：** G6（后端执行与运营精细度）/ 第八波第七刀（§3 池取用，极小成本）

## 现状基线（开工前核对）

- `orchestration/inbox-writer.ts` 全部写入口（notifyInbox / ensureIssueSubscriber）为**裸 DB 调用无错误处理**——写失败（FK 冲突/DB busy/磁盘满）会 throw 进调用方执行路径（run 完成/评论流程因 inbox 故障中断），且无任何可观测记录。activity-logger 侧已有 console.error（Slice 71），本刀补 inbox 侧。
- 全部 notify*（comment/run_terminal/assigned/skipped/escalated/deferred）都汇聚到 `notifyInbox` 唯一写路径 → 一处保护全覆盖。

## 落地改动

1. **inbox-writer.ts**：
   - `safeInboxWrite(channel, fn)` helper：try/catch + `logger.warn({channel, err}, '[inbox] 写失败（已降级 warn，不中断执行路径）')` + 进程内计数 `inboxWriteFailures: Map<channel, count>`。
   - `notifyInbox` 改为 wrapper + `notifyInboxInner`（写失败返回 null，语义与 prefs 挡掉一致）；`ensureIssueSubscriber` 的查询+insert 包入（channel=`ensure_subscriber`）。
   - 导出 `getInboxWriteFailures()` / `resetInboxWriteFailures()`（测试用）。
2. **ops-snapshot.ts**：`OpsSnapshot` 加 `inboxWriteFailures: Record<string, number>`；`buildOpsSnapshot` 透出（进程内计数，重启用尽）。

## 测试与实证

- `orchestration/inbox-writer.test.ts`（新，4 用例，mock db 可控抛错）：
  - 写成功：不 throw、零计数、零 warn
  - 写失败（db down）：**不 throw**（执行路径不中断）+ 返回 null + 计数 `{comment:1}` + logger.warn（channel 可检索）
  - 连续失败累积计数
  - ensureIssueSubscriber 失败降级（channel=`ensure_subscriber`）
- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 944 + web 465 = 1530 全绿**（1526 + 4）。
- 真机冒烟：dev server 热载后 `/api/ops/snapshot` 返回 `inboxWriteFailures: {}`（字段生效）。

## 决策记录

1. **汇聚点保护而非逐函数包**：notifyInbox 是唯一写路径（dedupe/insert/publish/通知全在内），一处 try/catch 全覆盖；ensureIssueSubscriber 是独立写路径单独包。
2. **失败降级为 null 而非 rethrow**：inbox 是旁路通知，不配中断 run 完成/评论主路径（G6 目标「失败/静默吞错全部可观测」的落点 = warn + 计数，而非传播）。
3. **计数进 ops-snapshot 而非新表**：进程内 Map 零持久化成本，/api/ops/snapshot 排障一页 JSON 已含（运维页可达）。

## 下一刀建议

§3 池剩余：**G6-7 Automation 连续 skipped 运营警示**（Settings 规则标黄 + 文案；可复用 G5-5 通知）· G6-5 消息/列表端点分页 · G6-9 memory pgvector/embedder provider 选择直测（G1-5 已覆盖软回退，补选择逻辑）。G6 目标陈述四条已全部落地（调度公平 G6-1 / 幂等占位 G6-2 / 可观测 G6-4·6·8·10 / 盲区清零 G6-3·4）。
