# Intake: R4 · mention 闭环完整性 · 2026-07-29

## 结论

**通过** — 调研发现 phase-g-plan 残留债未完全闭环（comment-trigger 仅 note，未全 WS 广播 + activity 提及可见性未全对齐 inbox-writer notifySquadEscalated），按默认顺序启动 R4。

**North Star**: 从 comment 解析 mention → enqueue run / notify inbox / publish summary comment → WS event + frontend cache + ActivityTimeline 展示提及闭环完整（comment-trigger / inbox-writer / event-bus / ws.ts / ActivityTimeline / MarkdownBody）

**Must**:
- parseMentions + triggerFromComment 在 comments.ts / run-worker.ts 挂接
- publishDispatchSummary 创建系统 comment 并 eventBus.publish('comment:created')
- notifySquadEscalated 在 inbox-writer.ts 处理 squad escalated，通知 leader/member
- ws.ts 订阅 comment:created / activity:created 更新 query cache
- ActivityTimeline / IssueDetail / TimelineItem 显示提及 badge / link
- Playwright e2e 验证 mention comment → run 派发 + activity 更新

**Out**:
- 富文本 mention 渲染全量（只做 link pill）
- 大规模 mention 场景（3+ mention）
- 真实 claude-code CLI mention 链路（S03 stdin 前置）

**Seams**:
- server/src/orchestration/comment-trigger.ts
- server/src/orchestration/inbox-writer.ts
- web/lib/ws.ts
- web/components/ActivityTimeline.tsx
- web/components/MarkdownBody.tsx

**Acceptance**:
- unit test (comment-trigger, inbox-writer, ws)
- Playwright path test (mention dispatch flow)
- main push + typecheck

**刻意不做**:
- 云 webhook / daemon 1:1 / 密钥入库 / 富文本全量
- 重做已关刀的 mention 可见性（slice mention-dispatch-visibility 已做）

下一刀：调研后拍板 U4 Onboarding（若 R4 调研发现已够则切换）
