# Closeout: workspace-cwd-persist

## 交付
- ADR：`docs/adr/0003-workspace-cwd-persistence.md`
- DB：`workspace.root_path` + drizzle `0015_workspace_root_path`
- server：`workspace-cwd.ts`（resolve/apply/set）；启动注入；settings status `cwd`；`POST /api/settings/workspace-cwd`
- readiness / run-worker / runtimes 走 resolve
- web：Settings「工作区路径」输入 + 保存

## 证据
- typecheck 绿
- migrate 成功；`root_path` 列存在
- API：
  - POST 有效路径 → ok + persistedPath
  - POST 无效路径 → 400
  - GET status.cwd / check cwd=ok
  - agent readiness `ready` + `cwdConfigured=true`
- Playwright：`settings-cwd-persist` / input / save 可见；文案含「保存到本地 DB」

## 决策
- env > DB；Settings 保存同时写 DB + 当前进程 env
- 路径非密钥，允许持久化；密钥仍 env-only
- 不引入 Multica `waiting_local_directory` 全状态机

## 债
- 换机器需重设路径
- 启动日志可再加「仅 DB 生效」用例文档
- Wiki LLM 仍依赖 export key（刻意）

## Multica 对照
- Multica：daemon 本机 `local_directory`
- 本仓：单 workspace `root_path` + Settings 可配

## 给下一 Owner
- 可选：无 env 冷启动回归（仅 DB）；或继续运营密度切片
