# Closeout: ops-toast-nav

## 交付

1. `useRunAutomationNow` 成功：打开 Issue；失败：settings 或看板自动化
2. `useCreateIssue` 成功：打开 Issue

## 证据

- typecheck 绿
- Playwright：立即执行 toast「打开 Issue」→ `/issues/...` 且来源徽章；新建 Issue toast 打开详情
