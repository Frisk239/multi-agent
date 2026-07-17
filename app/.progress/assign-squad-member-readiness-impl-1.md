# Handoff: assign-squad-member-readiness-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

1. AssigneeSelect 预取 squad detail，option 显示「阻塞 n/total」
2. 指派小队 confirm 含成员阻塞名单
3. 当前小队指派 hint：`assignee-squad-readiness-hint` + 小队详情 / 诊断链

## 证据

- typecheck 绿
- Playwright FRI-11：产品小队 option「阻塞 4/4」；hint 含队长+成员列表与小队详情链

## 再下一刀建议

- Inbox 失败聚合条
- 看板列计数反映仅失败筛选
