# issue-subscribe · impl-1（G2）

日期：2026-07-19

## 决策

- 复用 `issue_subscriber` 表；API：GET subscription / POST subscribe / unsubscribe
- 详情顶栏「关注 / 取消关注」；创建者默认 subscribed=true（reason=creator）
- 取消关注会移除订阅行（含 creator 原因）——本地单用户可接受

## 证据

- typecheck 绿
- API 往返 subscribe/unsubscribe
- Playwright：按钮 取消关注 → 关注

## 下一刀

- G3 issue-pr-link / G18 user-profile-brief / G5 board-column-i18n
