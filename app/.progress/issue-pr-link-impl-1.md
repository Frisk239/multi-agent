# issue-pr-link · impl-1（G3）

日期：2026-07-19

## 决策

- `issue.pr_url` 文本字段（本地 URL 引用，非 GitHub OAuth）
- PUT 校验 http(s)；详情 meta「PR」行内编辑
- 不做 webhook / PR 状态同步

## 证据

- typecheck 绿 · migration 0019
- API 400 非 URL；200 写回
- Playwright：显示 `Frisk239/multi-agent#42`

## 下一刀

- G18 user-profile-brief / G5 board-column-i18n / G14 runtime 文案
