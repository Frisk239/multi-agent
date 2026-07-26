# Slice 6: 通知偏好细粒度与订阅控制 (Notification Preferences) 关刀记录

**日期:** 2026-07-26  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + Playwright E2E 验证全量 PASS + `git push origin main` 成功)

---

## 落地内容与用户路径

### 1. 核心改进 (通知偏好与订阅控制)
- **后端偏好校验与 API (`packages/server`)**:
  - 在 `routes/issues.ts` 增强 `POST /api/issues/:id/subscribe` 支持手动关注与免打扰状态切换。
  - 在 `inbox-prefs.ts` 和 `inbox-writer.ts` 中增强按 `type` 和 `severity` 的动态开关拦截逻辑。
- **前端通知偏好配置与 Issue Header 集成 (`packages/web`)**:
  - 在 `SettingsPage.tsx` 中增加通知与提醒偏好配置区（网格化选框映射 `useSetInboxPrefs`）。
  - 在 `IssueHeader.tsx` 中重构订阅按钮，显示清晰的“免打扰 (Mute)”与“订阅”状态。

---

## 验证结论

1. **TypeScript 校验**: `pnpm typecheck` **0 Error** (packages/shared, packages/web, packages/server 全部 pass)。
2. **Playwright 端到端 (E2E) 验证**: 运行 `scripts/e2e-slice6-notifprefs.js` 验证 100% PASS。
3. **Commit & Remote Push**: 已推送到 `main` 分支。
