# workspace-cwd-persist

## 用户路径
运维打开 Settings → 输入本机仓库绝对路径 → 保存 → 诊断 cwd=ok → 无需 shell export 即可派活/执行。

## Must
- ADR 0003
- DB：`workspace.root_path`
- server：`resolveWorkspaceCwd` / 启动 apply / `POST /api/settings/workspace-cwd`
- settings status 显示 cwd 来源（env|db）
- web：Settings 表单保存 cwd
- typecheck + API + Playwright

## Out of scope
- 密钥写盘
- Multica waiting_local_directory 状态机
- 多 workspace 切换 UI
