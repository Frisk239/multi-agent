# Slice 2: Activity Log 结构化时间线 (GAP-01) 关刀记录

**日期:** 2026-07-24  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + Playwright E2E 验证 100% PASS + `git push origin main` 成功)

---

## 落地内容与用户路径

### 1. 核心改进 (GAP-01 Activity Log 时间线)
- **数据库 Schema (`activity_logs`)**:
  - `id`, `issueId`, `actorType` (member/agent/system), `actorId`, `actorName`, `eventType`, `payload` (JSON), `createdAt`
- **服务端自动记录与查询 API**:
  - `recordActivityLog`: 支持记录 `status_changed`, `priority_changed`, `assignee_changed`, `run_started`, `run_completed`, `run_failed` 事件。
  - 在 `PUT /api/issues/:id` 中拦截并自动写入状态/优先级/指派变更。
  - 在 `run-worker.ts` 中拦截并自动写入 Agent run 启动/完成/失败事件。
  - `GET /api/issues/:id/activities`: 返回 Issue 关联的结构化活动日志流。
- **前端结构化时间线 (`ActivityTimeline.tsx`)**:
  - `IssueDetail.tsx` 动态区扩充 `[ 评论 | 活动事件流 ]` 双选项卡。
  - 图标与色彩指示：🔄 状态变更、👤 指派变更、⚡ 优先级、🚀 Run 开始、✅ Run 完成、❌ Run 失败。
  - 深链支持：Run 相关事件自动提供 `/runs?run=<id>` 链接。

---

## 验证结论

1. **TypeScript 校验**: `pnpm typecheck` **0 Error** (packages/shared, packages/web, packages/server 全部 pass)。
2. **Playwright 端到端 (E2E) 验证**: 运行 `scripts/e2e-slice2-activitylog.mts`，3/3 核心断言全量通过（组件渲染、状态修改触发记录、双 Tab 自由切换）。
3. **Commit & Remote Push**: 已推送到 `main` 分支。
