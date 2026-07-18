# Closeout: board-status-focus

## 证据

- typecheck 绿
- Playwright：
  - `/?status=todo` → 仅 Todo 列 + chip + select
  - 清除 chip 恢复 6 列
  - 列头聚焦 Blocked → `?status=blocked`
  - CmdK `blocked` → 看板仅 Blocked

## 交付

- 状态列可分享聚焦，对齐 Multica 列表/筛选分享习惯

## 再下一刀建议

- 人指定主题；cwd 持久化 ADR
