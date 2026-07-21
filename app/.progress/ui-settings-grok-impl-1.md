# Closeout: ui-settings-grok（统一控件 + Settings 双栏 + Grok Build）

日期：2026-07-21  
分支：`main`（待 commit）

## 交付

### 1. Grok Build runtime（学 Multica `server/pkg/agent/grok.go`）
- `RuntimeId` 增加 `grok`
- `GrokBackend`：探测 `GROK_PATH` / `grok`；执行 `grok --no-auto-update agent --always-approve …`（打印模式优先，失败降级）
- 注册进 registry；models 静态列表（grok-4.5 等）
- Agents / AgentDetail / CmdK / Runtimes 文案含 Grok Build
- **非**完整 ACP hermesClient 移植；本地 CLI 适配 + 诚实错误

### 2. Settings UI（对照真站）
- 标题「设置」+ 左栏分区：我的账号 · 个人资料 / 工作区 · 代码仓库 / 本地运维 · 环境诊断
- 资料区 Multica 文案（关于你会发给 agent、字数）
- 诊断/健康仍在「环境诊断」Tab（本仓超车保留）

### 3. 集合页控件统一
- 全局筛选 `select` / 搜索框：高度 34、圆角 8、统一箭头与 focus 环

### 4. Helper 浮层（截图红框）
- **去掉 emoji** starter
- 气泡/输入/圆形发送按钮样式统一
- `error.tsx` 澄清为路由 error（避免 global-error 脱 QueryClient）
- HelperRail 包在 `Suspense` 内

## 证据
- typecheck shared/server/web 通过
- `GET /api/runtimes` → `grok:true:Grok Build`
- Playwright：Helper starters 无 emoji；agents 有 grok option；settings 双栏 nav

## 债
- Grok 完整 ACP stdio 会话（session/new + authenticate）未 1:1
- 用户浏览器若仍见 QueryClient 错误：硬刷新；多为 HMR/旧 error boundary 态
