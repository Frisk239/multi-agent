# Handoff: sidebar-inbox-fail-cue-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

侧栏 Inbox：`nav-badge--fail` + `data-fail` + title「含 N 条未读失败」；`nav-item--has-fail` 标签着色。数据复用 `useInbox` 未读失败计数。

## 证据

Playwright 首页：badge text=2 fail=2 class 含 nav-badge--fail；link 含 nav-item--has-fail。

## 再下一刀建议

- 看板 failed=1 时列标题显示过滤后计数（若需更醒目）
- Settings 未配置 cwd 时全局轻提示
