# board-column-i18n · impl-1（G5）

日期：2026-07-19

## 决策

- 看板列与状态文案中文化：待规划/待办/进行中/审核中/已完成/阻塞
- status 枚举值不变（API/DB 仍英文）
- 同步 IssueHeader / Timeline / Subtasks / ProjectDetail / CmdK / Sidebar title

## 证据

- Playwright 列头：待规划…阻塞

## 下一刀

- G18 user-profile-brief / G14 runtime 文案
