# Closeout: automation-rule-filters

## 证据

- typecheck 绿
- Playwright（本地 2 条规则）：
  - `?enabled=on` → `1/2`「验收巡检」
  - `?enabled=off` →「停用日报」
  - `?schedule=daily_at` → 每日 chip + 1 条
  - 空搜索 → empty + 清除恢复 2

## 交付

- `/automation`：q / enabled / schedule / failed 筛选 + chips
- 调度标签可点筛同类型
- CmdK：启用/停用/失败/间隔/每日

## 再下一刀建议

- 失败恢复密度（board/run 批量 retry 引导）；inbox 密度
