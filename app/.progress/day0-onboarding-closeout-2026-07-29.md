# Closeout: Day-0 Onboarding single flow

## 交付

- 删除看板内第二套 `OnboardingWizard`，全站只保留 RootLayout 的 `OnboardingCard`。
- 统一 versioned storage：`ma.day0-onboarding.v2` 与 session-only dismiss key，并迁移/清理旧 keys。
- 后端完成条件改为真实四步：可用 CLI、有效项目 `localPath`、活跃 Agent、已指派 Issue 且关联 Run。
- 返回首条 Issue/Run 深链；前端支持 focus/定时/手动刷新、API 错误重试、中途恢复和一次性成功去向。

## 证据

```text
cd app
pnpm typecheck
# PASS: shared / server / web

pnpm exec vitest run packages/server/src/routes/settings.onboarding.test.ts
# PASS: 1 file, 2 tests

cd packages/web
pnpm exec vitest run --config vitest.config.ts \
  components/OnboardingCard.test.tsx \
  lib/day0-onboarding.test.ts \
  components/KanbanBoard.error.test.tsx
# PASS: 3 files, 8 tests
```

Fresh DB Playwright CLI：

1. 清空 local/session storage，首页为 1 个 `onboarding-card`、0 个旧 wizard。
2. 初始步骤：CLI=done、Project=pending、Agent=done、Issue+Run=pending。
3. “稍后再说”后卡片隐藏，session key=`1`，local completion 仍为空。
4. 创建 `localPath=D:\code\multi-agent` 项目，并对已指派 FRI-07 发 mention 生成 Run。
5. `/api/settings/onboarding-status` 返回 `completed=true`，首 Run=`f93e119b-...`。
6. 新会话显示一次成功卡，CTA 到 `/runs?run=f93e119b-b4ec-45fe-8a5b-a45abc16025b`。
7. 返回首页并 reload 后 onboarding 与 success 均不重弹；控制台 0 errors。

## 偏离 / 债

- CTA 复用既有创建页，不自动代建 Project/Agent/Issue。
- 完成标记按 v2 永久隐藏；若未来产品要求“配置被删除后重新引导”，需要引入显式 reset/version bump，而不是静默覆盖用户完成选择。
- 不含全站视觉重做、auth、问卷、Helper agent 自动创建。

## 下一轮候选

1. 有限 infra 自动重试：按 `failureReason` 白名单、指数退避、预算与事件可观测。
2. 本地灾难恢复：DB + Wiki/AGENTS manifest、校验式 restore。
3. 继续体验巡检：错误 CTA/窄屏/空态只在发现真实阻塞时开刀。
