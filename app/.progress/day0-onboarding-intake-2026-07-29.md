# Intake: Day-0 Onboarding single flow

## 结论

**通过**

- `ccf231b` 已在 `origin/main`，工作树未混入本刀运行产物或密钥。
- closeout 覆盖单入口、四个真实完成条件、session dismiss、一次成功去向与 reload 不重弹。
- 抽样验收：旧 `OnboardingWizard` 已删除；RootLayout 仅挂一个 `OnboardingCard`；后端 `completed` 同时要求 runtime、有效 project localPath、活跃 Agent、assigned Issue + linked Run。
- 本刀债为显式设计边界：不自动代建实体；完成后若配置回退，需用户 reset/version bump，而不是静默重弹。

## 下一刀

允许进入有限 infra 自动重试调研与短对齐。
