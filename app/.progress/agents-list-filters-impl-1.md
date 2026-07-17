# Closeout: agents-list-filters

## 证据

- typecheck 绿（`@ma/web`）
- Playwright：
  - `/agents?runtime=claude-code` → `2/4`，chip「运行时 · claude-code ×」，行 `agt-lead`/`agt-proto`
  - `/agents?ready=cwd_missing` → 4 行均为 `cwd_missing`，chip 就绪
  - `q=zzz-no-such-agent` → empty + 清除恢复全量 4
  - 就绪 chip 链接 → `?ready=…`

## 交付

- `/agents`：`?q=` / `?runtime=` / `?ready=`（含 `blocked`）
- 筛选条 + active chips + 空态恢复
- 表内 runtime / readiness 可点筛选
- CmdK：cwd 未配置 / runtime 缺失 / blocked / 三 runtime 入口
- 页头链到 `/runtimes` · `/settings`

## 决策

- 客户端筛选（列表小）；ready 依赖已有 readiness map，无新 API

## 再下一刀建议

- squads 列表同款筛选；automation 规则搜索；失败恢复密度
