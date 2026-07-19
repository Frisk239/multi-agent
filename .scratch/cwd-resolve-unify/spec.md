# cwd-resolve-unify

## 用户路径
工作区路径已写入 DB 后：skill 扫描 / wiki 目录 / agents-bridge 与 readiness 一致生效；EnvBanner 引导去 Settings 保存路径（不依赖仅 shell export）。

## Must
- server：`skill/scanner` · `wiki/store` · `wiki/agents-bridge` 走 `resolveWorkspaceCwd`
- web：EnvBanner cwd 文案对齐持久化
- 冷启动证据：无 env 时 resolve 仍读到 DB path
- typecheck + Playwright（Settings 路径 + EnvBanner 或 Settings）

## Out of scope
- 密钥写盘
- Multica waiting_local_directory
