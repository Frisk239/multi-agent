# Closeout: squads-list-filters

## 证据

- typecheck 绿
- Playwright：
  - `?leader=agt-lead` → `2/3`，chip 队长
  - `?ready=cwd_missing` → 3 行队长均为 cwd_missing
  - 空搜索 → empty + 清除恢复 3
  - 行「运行」→ `/runs?squad=…`

## 交付

- `/squads`：`?q=` / `?leader=` / `?ready=` + chips + 空态
- 表内 leader / 就绪可点筛；看板 + 运行深链
- CmdK：队长 cwd / blocked；小队匹配附带 runs 入口

## 再下一刀建议

- automation 规则搜索/enabled 筛选；失败恢复密度
