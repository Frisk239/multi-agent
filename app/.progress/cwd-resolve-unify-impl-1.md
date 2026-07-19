# Closeout: cwd-resolve-unify

## 交付
- `skill/scanner` · `wiki/store` · `wiki/agents-bridge` 统一 `resolveWorkspaceCwd`
- EnvBanner cwd 文案：来源/保存路径引导
- Spec：`.scratch/cwd-resolve-unify/spec.md`

## 证据
- typecheck 绿
- `process.env.MA_WORKSPACE_CWD` 业务读取仅余 `workspace-cwd.ts`
- 冷启动脚本：`delete env` 后 `resolve` → `source=db` · path=`D:/code/multi-agent`
- Playwright：`/settings` `settings-cwd-persist` / input / save 可见

## 决策
- 不改 ADR 优先级；只统一读取入口
- wiki/skill 用 static import resolve（db client 已可在启动 scan 前加载）

## 债
- 密钥仍 env
- 全量 monorepo 无 env 重启 e2e 未单独起第二进程（resolve 单元烟测已覆盖）

## Multica
- 本机目录统一解析，对齐「配置后全局生效」体验

## 给下一 Owner
- 主航道完成态边界清晰；可选收官或人定新主题
