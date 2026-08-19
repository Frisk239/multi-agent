# G8-4a 调研：Runtime preflight 的诚实边界

> 日期：2026-08-17  
> 范围：只读；未改 `app/`、未改上游参考仓、未运行会改变机器状态的 CLI。  
> 决策题：在「本机 CLI 已发现」之外，哪些证据可以安全地称为 preflight；哪些只能诚实地标为 `unverified`。

## 结论

推荐先开 **G8-4a：能力与状态诚实**，而不是为了得到绿灯而启动 Grok ACP 或 Pi RPC。

- `detect` / `--version` 只证明二进制可发现，不能证明认证、模型、MCP 或实际会话可用。
- `unverified` **可派活但必须黄提示**；它不是失败，也不能显示成「已验证可跑」。
- 将来某 adapter 有被一手证据证明的、短时、无交互、无项目写入、可回收的 probe 时，`preflight.ok=false` 应进入现有 `status=error` 硬闸；不能因历史探测或 UI 绿色而掩盖真正 spawn 失败。
- 目前不应把 Grok `initialize` / `authenticate` 或 Pi `--mode rpc` 当作这种 probe。它们已经进入 runtime/session 生命周期，参考证据没有保证其零副作用或不触发认证。

这有意把原 G8-4 的「至少一个真实 adapter preflight」留给 **G8-4b**；G8-4a 的目标是先消除现有错误承诺，并留下可测试的接口与状态模型。

## 参考项目证据

| 参考 | 证据 | 对本仓的结论 |
|---|---|---|
| Multica | `references/repos/multica/server/internal/daemon/agents_probe.go:71-83` 明确把 CLI probe 定义成 pure discovery，且不做 version/min-version gate；`:119-125` 规定用户显式路径失效时 hard miss，不暗换其它 binary。 | 分开「发现」与「可注册/可运行」；不要以 PATH 命中伪装 readiness。 |
| Multica | `.../daemon.go:1413-1484` 对 discovery 之后再做受限重试的 version/min-version probe，并返回短 reason；`:1487-1546` 并发探测，将本轮失败写到 health 的 skipped agents，成功者才注册 online。深读摘要在 `references/deep/multica.md:237-250`。 | preflight 若失败必须有可操作原因和健康面；不过不能把 Multica 的 daemon registration 语义直接等同本仓一次 agent run。 |
| Multica | `references/deep/multica.md:122-132`：先准备 workdir/exec env，再转 running，再 `Backend.Execute`；`.../pkg/agent/agent.go:347-379` 给 UI 只暴露最小 launch skeleton，而不是完整 argv。 | 预检只是一份时间点证据；运行临界区仍要如实处理 spawn/认证失败。customArgs 的 UI 应按 adapter 能力显示，不应靠试跑用户参数验证。 |
| Multica | `.../pkg/agent/mcp_config.go:8-13` 区分 null=inherited 与显式对象=managed strict；`.../pkg/agent/kiro.go:53-60` 遇到 MCP JSON 错误 fail-closed。 | catalog 未加载/未知时 MCP 必须默认不支持；不为 preflight 启动 MCP server。 |
| Pi | `references/deep/pi.md:161-188`：Pi 的嵌入边界是 session factory/RPC 进程和事件流，而非 readiness API；`references/repos/pi/packages/orchestrator/src/rpc-process.ts:37-48,86-98` 只是 spawn RPC、接 stdio、将 exit/error 传播。 | Pi 没有可直接复用的「独立 ready handshake」；不可为 UI 绿灯启动一个 RPC session。 |
| Grok ACP | `references/repos/multica/server/pkg/agent/grok.go:273-313`：initialize 之后仍需根据 advertised auth methods 做显式 authenticate，才可做 session 操作。 | Grok 的 initialize/auth 已跨进认证生命周期；在没有供应商无副作用保证前，不把它作为 G8-4a probe。 |

补充：Multica 的 Backend 核心接口仍只有 `Execute`（`references/deep/multica.md:252-261`），说明 preflight 是宿主可加的运行前层，不应修改「adapter 驱动已有 CLI」这一宪法钉。

## 本仓当前真实行为与缺口

### 后端

1. `RuntimeBackend` 只含 `detect()` 和 `execute()`；`DetectResult` 仅 `{installed, version, path}`（`app/packages/server/src/runtime/types.ts:65-100`）。五个 adapter 都是 `resolveCmd` + `versionOf`，如 Claude 的 `claude-code.ts:145-148`、Pi 的 `pi.ts:127-131`、Grok 的 `grok.ts:132-135`。`resolveCmd` 本身是 discovery/login-shell fallback（`detect-path.ts:107-194`），`versionOf` 只是受 8s 限制的 `--version`（`:197-216`）。
2. `computeAgentReadiness` 在已安装、真实执行 adapter、并发有余时将状态设为 `ready`（`orchestration/readiness.ts:82-112`）；虽然它现在返回 `runtimeVerification: 'unverified'`（`:114-128`），没有 `preflight passed/failed` 层，也没有 preflight fail 的派活语义。
3. `/api/settings/live-probes` 每次循环 `detect()`，并把 `executionImplemented && installed` 命名为 `ready`（`settings-live-probes.ts:88-105`）。页面每 5 秒刷新（`SettingsPage.tsx:1970-1976`），因此未来不能把昂贵的真实 CLI spawn 直接塞到这条无缓存路径。
4. `/api/runtimes` 已把 `supportsMcpConfig` / `supportsCustomArgs` 送给 UI（`routes/runtimes.ts:11-29`）；但 shared `RuntimeInfo` 的两个字段仍 optional（`shared/schema.ts:632-645`），所以 consumer 必须显式 `=== true` 才安全。
5. 既有硬闸已覆盖 `cwd_missing` / `runtime_missing` / `error`：issue enqueue (`run-service.ts:248-284`) 和 quick run (`routes/quick-runs.ts:57-84`) 都复用 readiness。这适合将来承接**明确的** preflight failure；`MA_ENQUEUE_ALLOW_NOT_READY` 仍是本地排障旁路。

### 前端 UX

1. Agent Detail 已显示 installed-but-unverified 文字（`AgentDetailPage.tsx:163-173`），但 Capabilities Tab 在 runtime catalog 尚未返回时写了 `: true`（`:470-477`）。这会短暂显示 MCP 编辑器，违反 unknown=unsupported。
2. customArgs 无条件在设置页 `EnvVarsEditor` 渲染（`AgentDetailPage.tsx:918-1015`），`InstructionsTab` 没有接收 `supportsCustomArgs`（`:1019-1108`）。因此不支持 customArgs 的 adapter 仍有可编辑入口，保存后可能静默无效。
3. `AssigneeCombobox` 只根据 readiness 的硬状态禁用 option（`AssigneeSelect.tsx:27-48,161-186`），没有消费 `runtimeVerification`。`NewIssueForm` 复用它（`NewIssueForm.tsx:571-583`）；所以主派活路径没有黄提示。Quick Dispatch 还使用另一套原生 `<Select>`（`QuickDispatchPanel.tsx:351-389`），可留给后续一致化。
4. Settings Live Probes 目前把 installed+unverified 显示为 `installed · unverified`（`SettingsPage.tsx:2011-2051`），但其统计仍叫 `runtime installed`，没有 preflight failure 面。通用 Settings CLI diagnostics 还会在发现 version 时标 `ready`（`routes/settings.ts:622-644`）；这不应在 G8-4a 被解释为执行验证成功。

## 可行边界

### A. 全量真实 probe（不推荐现在做）

每个 adapter 执行一个 CLI 子命令，成功即 verified。

问题：现有一手资料无法证明 Claude、Grok、Pi 的认证/模型命令没有写 state、弹认证、访问网络或长期占进程；而 Settings 5 秒轮询和 readiness 15 秒轮询会放大进程数。此方案会把「技术上能 spawn」误成「安全预检」。

### B. Grok ACP initialize / Pi RPC handshake（明确不选）

Grok 的 ACP initialize 后需 authenticate 才能运行；Pi RPC 的 spawn 直接建立 runtime 进程，没有独立 ready contract。两者都已经是执行生命周期的一部分，不能满足 kickoff 的无副作用、无交互认证、不开长期 CLI 要求。

### C. G8-4a 能力与状态诚实（推荐）

新增可选 `RuntimeBackend.preflight?(ctx): Promise<PreflightResult>` 与共享的显式状态，例如：

```ts
preflightStatus: 'not_available' | 'passed' | 'failed'
runtimeVerification: 'unverified' | 'verified'
```

- 无 `preflight` 的 adapter：`not_available` + `unverified`；允许派活、以黄色说明「已安装，尚无安全预检，首次运行仍可能失败」。
- 将来已验证安全的 adapter：`passed` + `verified`；`failed` 进入 `status: 'error'`，复用当前 server 硬闸并输出短、可操作、无密钥 detail。
- G8-4a 不让生产 adapter 实现猜测性的 probe；用 fake backend / mock preflight 覆盖 contract、失败映射和 UI。这样接口可被后续真实 adapter 采用，却不会为页面刷新启动 CLI。
- MCP/customArgs 取 catalog 的显式真值：catalog 缺失、runtime 未找到、字段未声明都为 `false`。

## 推荐最小垂直切片：G8-4a

### Must

1. 在 `runtime/types.ts`、shared readiness/live-probe schema 中增加 `PreflightResult` / `preflightStatus`；由一个集中 helper 计算，避免各 route 各自解释状态。
2. `computeAgentReadiness` 与 `buildLiveProbes` 透传三层：installed、preflight status、verification。测试 fake backend 的 `preflight` passed/failed/not-available：仅 explicit failed 映射 `status=error`；not-available 保持可派活且 unverified。
3. 明确记录 `preflight` 的调用限制：必须有 timeout/AbortSignal、不得接受 prompt/customArgs/MCP、不得写 project、不得启动交互登录；G8-4a 的生产 registry 不挂未证实安全的 probe。
4. Agent Detail：catalog loading / missing / unknown 时 `supportsMcpConfig=false`；向 `InstructionsTab` 传 `supportsCustomArgs`，不支持时隐藏或禁用输入并解释「adapter 不消费，避免静默保存」。
5. 选一个主派活路径：在共享 `AssigneeCombobox` 的 option 文案标 `⚠ 未验证`，并在 `NewIssueForm` 已选 agent/squad leader 为 unverified 时显示黄色 banner；不禁用提交。
6. Settings Live Probes 逐 runtime 显示「已安装 · 预检未提供 / 通过 / 失败」，其中失败不再归入 ready。为新的 UI 和 mock backend 状态补组件/单元测试。

### Out

- 不启动 Grok ACP、Pi RPC、MCP server、交互式 login，且不执行用户 customArgs。
- 不承诺「已安装」等于认证/模型/网络可用。
- 不改 `RuntimesPage`、Quick Dispatch、通用 CLI Health Inspector 的全部视觉重构；这些保留为 G8-4b/UX follow-up，避免扩大成多入口改版。
- 不做 20 个 runtime 的 probe；后续真实 probe 先需要供应商一手文档/可重复 fixture 证明安全性，再单 adapter 落地，并加 TTL + one-flight cache。

### 验收

- fake backend `preflight -> failed`：agent readiness / live-probe 返回 `preflightStatus=failed`、`status=error`，issue 和 quick-run server gate 都拒绝排队。
- fake backend 无 `preflight`：`runtimeVerification=unverified`，仍按当前 ready/busy 语义可排队；UI 主派活路径出现黄色解释，不出现绿色 verified。
- catalog loading 和 unknown runtime：Capabilities Tab 不出现 `agent-cap-mcp` 编辑器；`supportsCustomArgs=false` 不出现有效编辑入口。
- `pnpm --filter @ma/shared test`、server targeted tests、web `AgentDetailPage` / `NewIssueForm` / `SettingsPage` tests + typecheck 通过；Owner 再做一次 Playwright 的新建 Issue 主路径检查。

## 与当前未提交 WIP 的重叠风险

高风险冲突文件已全部处于 dirty 状态：`runtime/types.ts`、`orchestration/readiness.ts`、`settings-live-probes.ts`、`shared/schema.ts`、`routes/runtimes.ts`、`AgentDetailPage.tsx`、`SettingsPage.tsx`。其中已有未提交的 G8-2/G8-3/WIP 改动：

- `types.ts` 的 `onProcessStarted` 与 MCP/customArgs capability；
- readiness/live-probes/shared schema 的首版 `runtimeVerification: 'unverified'`；
- runtime catalog capability 字段；
- Agent Detail 的 MCP capability gate（但 loading 默认仍为 true）和 envRef UX；
- Settings 的 secret-safety 和 unverified 文案。

因此 G8-4a 必须**在这些 WIP 的当前内容上增量 patch**，不可 checkout/revert 或假定 clean base；最好等 G8-3 owner 验收内容冻结后由同一实现者一次性改共享 schema/Agent Detail，避免在相同行段平行修改。G8-2 对 `RuntimeBackend`/readiness 的改动也不能被覆盖。

## 后续 G8-4b 入口

只在拿到一手 CLI 文档或安全 fixture 后选择单 adapter；实现真正的短时 preflight，配置 TTL/one-flight 缓存和手动刷新。它必须证明：spawn 后能在 deadline 内退出、没有项目写入、没有 UI 登录、没有创建 MCP/session、failure 文案不回显 credentials。届时再把 `preflightStatus=failed` 接入真实硬闸。
