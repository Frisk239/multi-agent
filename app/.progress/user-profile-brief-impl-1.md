# user-profile-brief · impl-1（G18）

日期：2026-07-19

## 决策

- `user.about` 列；`GET/PUT /api/profile`
- Settings「关于你」卡片编辑 name/about
- `buildPrompt` / `buildQuickCreatePrompt` 注入 `# About the Human Operator`（空则跳过）
- 非密钥；不做多用户协作

## 证据

- typecheck 绿 · migration 0020
- API put/get about
- Playwright Settings 见「关于你」卡

## 下一刀

- G14 runtime 文案 / G19 local-api-token / G20 settings 叙事
