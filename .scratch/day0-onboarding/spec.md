# Day-0 Onboarding single flow

Status: done

## 用户路径

全新浏览器与空/半配置本地数据库进入控制台时，只看到一套可恢复的引导：确认可用 CLI → 创建或绑定有 `localPath` 的项目 → 创建 Agent → 创建并指派第一条 Issue → 进入 Issue/Run 观测。刷新后从真实完成条件继续；仅“稍后”在当前会话隐藏，完成后永久不重弹。

## Must

1. 移除 `OnboardingCard` / `OnboardingWizard` 的双入口、双 storage key、双完成判定；保留一个组件与一个 versioned storage schema。
2. 每一步由真实后端条件驱动：至少一个可用 runtime、至少一个有效项目 localPath、至少一个活跃 Agent、至少一条已指派 Issue 且有 linked/active Run（或明确人工跳过最终派活）。
3. 引导内提供明确 CTA 并能从目标页返回后刷新状态；中途 reload 不丢进度。
4. “稍后再说”仅写 sessionStorage；新浏览器会话重现。完成只写 localStorage versioned key；兼容/清理旧 key。
5. 完成后只显示一次成功去向，可进入首条 Issue/Run，不重复弹两套 UI。
6. API 错误可解释并重试；窄屏不遮住主要页面操作。
7. component/unit + Playwright CLI 覆盖 fresh storage、逐步满足、session dismiss、reload、完成不重弹。

## Out

- 云登录/auth、问卷、Helper agent 自动创建、daemon。
- 密钥 UI/入库。
- 全站视觉系统重做。
- 自动替用户创建项目/Agent/Issue；CTA 进入既有创建路径即可。

## 参考

- Multica `references/repos/multica/packages/views/onboarding/onboarding-flow.tsx:88-103`
- Multica `references/repos/multica/packages/views/onboarding/welcome-after-onboarding.tsx:44-64`
- 本仓 `OnboardingCard.tsx`、`OnboardingWizard.tsx`、`settings.ts` onboarding status。

## 验收

- `pnpm typecheck`
- 聚焦 component/API tests
- Playwright CLI：单入口、真实步骤、session dismiss、reload、完成不重弹
- closeout + commit/push main
