# G6-8 请求级慢日志 —— closeout（2026-08-03）

**刀名：** G6-8 请求级慢日志（>1s 记 warn，用户报慢有据可查）
**Goal：** G6（后端执行与运营精细度）/ 第八波第五刀（§3 池按价值取用：极小成本 + 直击运营痛点）

## 现状基线（开工前核对）

- Fastify `logger: true` 仅 info 级「request completed」（含 responseTime），无阈值告警——用户报「某页慢」时日志无可检索的慢请求标记；Q6 settings 3s 瓶颈修复前正是这类问题的实例。

## 落地改动

- `app.ts`：
  - `SLOW_REQUEST_THRESHOLD_MS = 1_000`（导出常量）+ `buildSlowRequestLog(opts)` 纯函数（< 阈值返回 null 不记；≥ 返回 `{method, path, durationMs(四舍五入), statusCode}` 条目）。
  - `buildApp()` 注册 `onResponse` hook：`reply.elapsedTime`（Fastify 内置计时）≥ 1s → `req.log.warn({...entry}, '[slow-request] 响应超过 1s')`——带 reqId/pid/hostname 的 pino 结构化行，可 grep `slow-request`。

## 测试与实证

- `app.slow-log.test.ts`（新，5 用例）：阈值常量=1000 / 999 不记 / 1000 恰达记 / 1001 字段透传 + 耗时四舍五入 / query 串原样透传（可复现）。
- 真机冒烟：重启 dev server（新代码）→ `/api/issues` `/api/runs` 200 + info 行正常（29ms/9ms 快速请求**不**误报 slow-request）；hook 启动无副作用。
- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 936 + web 465 = 1522 全绿**（1517 + 5）。

## 决策记录

1. **纯函数 + 薄 hook**：阈值判定可直测（Fastify 集成测试难注入慢请求）；hook 只做「elapsedTime → warn」8 行。
2. **onResponse 而非 onRequest 计时**：Fastify 官方语义（onRequest 阶段 elapsedTime 不可用）；warn 级避免 info 刷屏，慢请求可 `grep slow-request` 检索。
3. **path 原样含 query**：复现时能区分同路由不同参数。

## 下一刀建议

§3 池剩余：**G6-4 sweeper 收尸路径原子化 + 假批量注释修正**（学 multica `agent.sql:569`；deferred 查重去 N+1；「批量更新」注释诚实性污点，价值低·中）· **G6-7 Automation 连续 skipped 运营警示**（Settings 规则标黄 + 文案）· G6-5 分页 · G6-9 pgvector 测试 · G6-10 inbox 观测（后两者已部分覆盖：G1-5 pgvector 软回退 + activity-logger 已 warn）。
