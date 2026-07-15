# 跨切片代码审计报告（S01-S03 合并后）

> 日期：2026-07-15 · 审计范围：main 上的 S01（看板+WS）+ S02（详情+时间线+评论）+ S03（真实执行）
> 代码量：3505 行 TS/TSX（shared 267 + server ~1300 + web ~1900）
> 方法：计划者主导 + Explore agent 全量扫描 + 严重问题人工复核

## 总体评价

代码质量高：零 TODO/FIXME/HACK，shared 契约与 reshape 映射完整，label 解析统一走 `client.ts`，WS 事件幂等处理一致。发现 12 个问题，其中 2 个真实 bug（应修）、5 个中等问题（建议修）、5 个轻微项（可选）。

---

## 🔴 严重（真实 bug，建议尽快修）

### A1. run 终态竞态：cancelled 覆盖 completed
- **位置**：`server/src/orchestration/run-worker.ts:153`
- **问题**：`if (result.exitReason === 'cancelled' || signal.aborted)` —— 若 cancel 请求与 execute 完成几乎同时（signal 在 execute 返回后才 abort），worker 会把已 completed 的 run 改写成 cancelled。而 `cancelRunById` 用条件 UPDATE（status IN active）挡住了 completed 后的取消——两者判定不一致，终态可能来回跳。
- **影响**：用户看到 run 状态从 completed 跳回 cancelled（答辩 demo 时难看）
- **修复**：终态 UPDATE 加 `WHERE status IN ('running','queued')` 条件，避免覆盖已落定的 completed。或 cancelled 分支仅看 `result.exitReason === 'cancelled'`
- **归属**：S04 impl-2 的 RunWorker 重写时一并修（Task 2.5 要重写整个 run-worker.ts）

### A2. "system" 作者的 comment label 显示原始 id
- **位置**：`server/src/db/client.ts:33-43`（resolveAuthorLabel）+ `run-service.ts:106`（熔断 comment authorId:'system'）
- **问题**：熔断系统 comment 写 `authorId:'system'`，但 users 表无此行。resolveAuthorLabel fallback 返回原始 id `'system'`，前端显示"system"而非"系统"
- **影响**：S04 熔断 comment 的作者显示不友好
- **修复**：resolveAuthorLabel 对 `id==='system'` 短路返回"系统"
- **归属**：S04 impl-2 的熔断逻辑时一并修（同一个 run-service.ts）

---

## 🟡 中等（建议修，不阻塞 S04）

### B1. run:progress 事件前端零处理（接口断层）
- **位置**：`run-worker.ts:77` publish；`web/lib/ws.ts:84` 仅注释无 case
- **问题**：server 每条 message_delta/log 都广播 run:progress，但 web 完全不消费。要么前端缺流式 UI，要么该事件下沉为 server-only
- **建议**：S04 若不做流式输出，把 run:progress 从 DomainEvent 移除、run-worker 改 console.debug。若要做，给 RunStatusBar 加 progress 文本态

### B2. AgentRun.isLeader/squadId 前端全链路未消费
- **位置**：schema 定义 ✅ → reshape 映射 ✅ → server 返回 ✅ → web 类型继承 ✅ → **无组件读取**
- **问题**：S04 后端 leader/squad 闭环完整，但前端无视觉反馈区分 leader run 与普通 run
- **建议**：RunStatusBar 加 isLeader 徽标。归属 S04 impl-3（前端）

### B3. SquadDetail 契约无 HTTP 端点暴露
- **位置**：shared 导出 SquadDetail/SquadMember，但 roster.ts 只返回 `{id,name}`
- **问题**：web 若要展示 operatingProtocol/missionDirective 无端点可取。属"契约先行、路由未补"
- **建议**：若 S04 不做详情页，把 SquadDetail 降级为 server 内部类型；否则补 GET /api/squads/:id

### B4. issue:created 预填 ['issue',id] cache + staleTime:Infinity
- **位置**：`web/lib/ws.ts:41`
- **问题**：新建 issue 时预填单条 cache，但该 key 从未 fetch（无 loading/error 元数据），staleTime:Infinity 导致永不后台刷新。当前功能不坏（事件 payload 完整），但破坏 react-query fetch-first 语义
- **建议**：issue:created 只更新 ['issues'] 列表 cache，不预填 ['issue',id]

### B5. GET /api/runs 无 issueId 时返回 []（掩盖调用方 bug）
- **位置**：`server/src/routes/runs.ts:13`
- **问题**：参数缺失返回 200 空数组而非 400，把"参数缺失"伪装成"无数据"
- **建议**：返回 400（或保持现状，web 的 enabled 已覆盖）

---

## 🟢 轻微（可选优化）

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| C1 | claude-code.ts:21, cursor.ts:27 | `Record<string,any>` 两处（解析 CLI JSON 流） | 改 `Record<string,unknown>` + narrow |
| C2 | api.ts:16, ws.ts:23 | `localhost:3001` 硬编码两处 | 抽 `NEXT_PUBLIC_API_BASE` |
| C3 | issues.ts:12, seed.ts:11 | `WS_ID='ws-local'` 重复定义 | 统一到 constants.ts |
| C4 | client.ts:5 | `./dev.db` 相对路径依赖 cwd | 用 path.resolve 基于 __dirname |
| C5 | api.ts:134-140 | description 乐观更新与 assignee 策略不对称 | 可接受，保持现状 |

---

## 修复优先级建议

| 优先级 | 项 | 时机 |
|---|---|---|
| **P0** | A1 终态竞态 + A2 system label | S04 impl-2（同一文件，顺手修）|
| P1 | B1 run:progress + B2 isLeader 前端 + B4 issue cache 预填 | S04 impl-3（前端）或 S04 收尾 |
| P2 | B3 SquadDetail 端点 + B5 runs 400 | S04 收尾或 S06+ |
| P3 | C1-C5 轻微项 | 随手改或技术债清理批次 |

---

## 维度小结

| 维度 | 结论 |
|---|---|
| shared 契约 vs 实际 | 基本一致；例外 SquadDetail 无路由（B3）、run:progress 前端不消费（B1）|
| DB vs reshape | ✅ 无遗漏列，nullable 一致 |
| WS 事件 | 7 类中 6 类正确幂等；run:progress 零处理（B1）|
| bug/技术债 | 零 TODO；2 真实 bug（A1/A2）；2 处 any（C1）|
| 跨切片断层 | 看板/详情双 cache 基本一致；issue:created 预填有隐患（B4）|
