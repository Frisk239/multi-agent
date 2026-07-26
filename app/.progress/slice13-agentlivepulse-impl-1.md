# Slice 13 (S2): Agent 动态脉冲状态与 WS 事件加深 (Agent Live Pulse Badges) 关刀记录

**日期:** 2026-07-26  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + Playwright E2E 验证 100% PASS + `git push origin main` 成功)

---

## 落地内容与架构加深

### 1. 核心改进 (Multica 风格 Agent 动态脉冲状态徽章)
- **契约与事件模型 (`packages/shared/src/schema.ts`)**:
  - 新增 `AgentPulseStatus` 枚举 (`idle` | `working` | `blocked` | `failed` | `offline`)。
  - 扩展 `AgentSummary` 和 `AgentDetail` Schema，新增 `liveStatus` 和 `activeRunCount` 属性。
  - 新增 `AgentStatusChangedEvent` 结构，并纳入 `DomainEvent` 联合类型。
- **服务端状态计算与广播器 (`packages/server`)**:
  - 新建 `agent-status-broadcaster.ts` 模块，根据活跃 Runs 自动实时计算 `AgentPulseStatus`。
  - 在 `event-bus.ts` 中挂载自动拦截器：任何 Run 生命周期变化 (`queued`, `running`, `completed`, `failed`, `cancelled`) 自动派发 `agent:status_changed` 事件。
  - 在 `reshape.ts` 中增强 `toAgentSummary` 与 `toAgentDetail`，确保 API 返回即包含 Live 状态。
- **前端动画徽章与响应机制 (`packages/web`)**:
  - 新建 `AgentStatusBadge.tsx` 组件，支持不同尺寸（sm, md, lg）与状态。
  - CSS Keyframes 呼吸灯效果：`working` (绿/蓝脉冲光晕 `agent-pulse-working`), `blocked` (橙色脉冲 `agent-pulse-blocked`), `failed` (红色脉冲 `agent-pulse-failed`), `idle` (灰色常亮)。
  - 在 `AgentsPage.tsx` 和 `AgentDetailPage.tsx` 注入脉冲状态徽章。
  - 在 `lib/ws.ts` 捕获 `agent:status_changed` 并更新 React Query 缓存，同时优化 WS 断线重连策略（仅刷新关键视图 Queries，降低开销）。

---

## 验证结论

1. **TypeScript 静态校验**: `pnpm typecheck` **0 Error** (packages/shared, packages/server, packages/web 全部 pass)。
2. **Playwright 端到端 (E2E) 验证**: 运行 `pnpm --filter @ma/web exec node ../../scripts/e2e-slice13-agentlivepulse.js`，100% 通过（验证了 4 个 AgentStatusBadge 渲染、呼吸灯 CSS 动画及详情页连通）。
3. **Git Commit & Push**: 已推送到 `main` 分支。
