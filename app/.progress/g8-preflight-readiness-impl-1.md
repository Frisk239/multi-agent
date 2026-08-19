# Closeout: G8-4a · Runtime preflight 状态、派活前诚实度与能力门控

日期：2026-08-17  
Spec：`.scratch/g8-trust-execution/spec.md` §G8-4 · `kickoffs/G8-4-preflight-readiness.md`

## 决策与参考

- 调研：`.scratch/g8-trust-execution/research-preflight-readiness.md`。
- Multica 将 CLI discovery 与后续 health/registration 分开；Pi 没有可独立复用的 ready handshake。Grok ACP 在 `initialize` 后仍需认证（研究报告含原始 file:line）。
- 因而本刀选择 **G8-4a「状态与能力诚实」**：不把 `detect()` / `--version`、Grok ACP initialize/auth 或 Pi RPC spawn 冒充为无副作用预检。真实 adapter probe 留给 G8-4b，前提是取得一手安全证据或可重复 fixture。

## 交付

- `RuntimeBackend` 增加可选、受限的 `preflight(context)` 契约。context 仅含 `AbortSignal` 和 timeout；结果只能是固定的安全分类，不能把 provider 输出、路径、配置或凭据带到 API/UI。
- 新增 TTL + one-flight 的 runtime preflight helper。无 probe 是 `preflightStatus: not_available` + `runtimeVerification: unverified`；显式 passed 才为 verified；显式 failed 进入 `status: error`，复用 Issue/Quick Run 的既有后端硬闸。
- 生产 adapter **全部仍未挂 preflight**；Settings 的 5 秒 live-probe 轮询只读取缓存，绝不为诊断启动新的预检子进程、ACP session 或 MCP server。
- readiness 和 Settings live-probes 共享 `not_available | passed | failed` 契约；老服务端字段仍可选，前端兼容。
- Agent Detail 的 MCP/customArgs 仅在 runtime catalog 显式 `true` 时放行。catalog 加载中、runtime 未收录或字段缺失都 fail-closed，并区分「未知」和「明确不支持」。
- 已存但 adapter 不消费的 customArgs 不会随着其他设置静默保存；用户只能看见只读值并经危险确认单独清除。
- New Issue / AssigneeCombobox 显示「已安装 · 未安全预检」黄色提醒，仍允许创建/派活；明确 `preflightStatus=failed` 不会误显示成未预检，而是保留失败详情和硬闸。Settings 同样明确显示「未提供 / 通过 / 失败」。

## 验证证据

- `pnpm check`：全部通过。shared **123**、server **998**、web **486** tests；三个 package TypeScript typecheck 均通过。
- 定向覆盖：无 probe、safe passed、safe failed、TTL/cache-only Settings polling、Issue 与 Quick Run failed gate；catalog absent/unknown/unsupported、旧 customArgs 显式清除、New Issue 未预检可提交与 explicit failed 文案、Settings 三种状态。
- Playwright（隔离临时 SQLite，迁移并 seed；未写默认开发 DB，也没有提交会启动真实 CLI 的 Issue）：
  1. New Issue 下拉的实际 opencode Agent 显示 `ready · 未安全预检`；选中后出现「认证、模型和 MCP 尚未验证，首次运行仍可能失败」黄色提示，提交按钮仍可用。
  2. Agent Detail 显示 CLI 已安装但未预检；opencode 的 MCP 能力页明确显示 adapter 不消费配置，设置页则保留已声明支持的 customArgs 编辑器。
  3. Settings → Live Runtime Probes 显示 5 个已安装 CLI 的「未提供安全预检」，并明确 detect 不验证认证、模型或 MCP。
  4. 观察到首次开发态 WebSocket 的短暂连接关闭后自动重连；最终页面为「WebSocket 已连接」，浏览器无本刀应用错误。测试 server 与 web 均已停止。

## 限制与下一步

- `verified` 是时间点证据，实际 launch 仍必须如实处理 spawn/auth/model 失败。
- 目前没有生产 adapter 的真实 preflight；不得因为页面需要绿灯而启动 Grok ACP、Pi RPC、交互登录或用户 customArgs。
- 下一条主切片为 G8-5：在 transcript 落库与 WS 推送前做高置信 secret scrub。G8-4b 仅在证实单 adapter probe 的无副作用、短时退出、无项目写入/无登录/无 session 条件后再单独实现。
- 当前 worktree 含大量非本刀 WIP（包括 G8-2/G8-3），未 commit/push，避免混合提交。
