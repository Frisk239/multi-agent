# 执行者 Kickoff · G8-4 Runtime preflight + 派活前 UI 分层

---

## 启动提示词（复制从下一行开始）

```
你是本仓实现执行者。工作区：multi-agent 仓库根。全栈小刀，契约+API+UI 同刀。

## 铁律
- preflight **无副作用**：不写项目文件、不弹交互认证、不长期占 CLI。
- 无安全 preflight 的 runtime 保持 `unverified`，禁止伪装「已验证可跑」。
- 不改宪法：Backend adapter 驱动本机 CLI。

## 本刀：G8-4 · preflight + readiness 分层 + capability UI
规格：`.scratch/g8-trust-execution/spec.md` §G8-4

### 现状
- `DetectResult` 仅 installed/version/path
- `readiness.ts` / `settings-live-probes.ts`：`runtimeVerification: 'unverified'`，安装后仍可 `ready`
- MCP Tab：`AgentDetailPage` 在 catalog 缺失时 `supportsMcpConfig === true`（错误默认）
- customArgs UI 不读 capability 矩阵

### Must
1. **Backend（至少 1–2 个可测 adapter + 接口）**
   - `RuntimeBackend` 增加可选 `preflight?(ctx): Promise<PreflightResult>`（ok/checks[]/message）。
   - 实现策略：
     - 能安全做的：如 list-models / `--version` 已覆盖外的「可启动探活」轻量命令；失败记 preflight_fail。
     - 不能安全做的：明确不实现，UI 保持 unverified。
   - readiness / live-probes 分层字段：至少能区分 installed、preflight 结果、verification 状态；**不要**把 preflight 失败仍标成无条件 ready（产品可选：仍允许派活但强警告——默认推荐：preflight 明确失败时降低为不可派活或 warning 门，与现有 cwd/runtime_missing 风格一致，在回报里写清选型）。
2. **Frontend**
   - Agent 详情 / Settings probes 展示分层文案（已安装 · 预检失败/通过 · 未验证）。
   - 指派路径（AssigneeSelect / NewIssue / QC 至少一处主路径）：unverified 或 preflight 失败有黄提示。
   - **MCP：** catalog 未加载或未知 → 默认 **不**展示 MCP 为支持（`supportsMcpConfig` 默认 false）。
   - **customArgs：** 按 `supportsCustomArgs` 隐藏或禁用。
3. 单测 + 必要组件测；typecheck 绿。

### Out
- 完整 OAuth 登录 UI
- 20 个 runtime 全实现 preflight（先 claude-code / grok / pi 中能做的）
- Pi 交互审批大系统（G6-6 无人值守保留）

### 建议触摸
- `runtime/types.ts`, 各 `*Backend`, `registry`
- `orchestration/readiness.ts`, `settings-live-probes.ts`
- `shared/schema.ts` readiness 形状
- `AgentDetailPage.tsx` CapabilitiesTab / Settings
- `AssigneeSelect` / `NewIssueForm` / `QuickDispatchPanel` 择主路径

### 验收自测
- [ ] mock preflight fail → UI 可见且派活语义符合选型
- [ ] catalog 加载中不闪 MCP 编辑
- [ ] supportsCustomArgs=false 时无有效编辑入口
- [ ] 既有 detect grace（G1-3）不回归

### 回报
选型（派活硬闸 vs 警告）、文件列表、测试结果、截图/文案摘录可选。
```

---

## 计划者验收清单（G8-4）

- [ ] preflight 接口与至少一处真/mock 实现  
- [ ] UI 分层 + MCP/customArgs 门  
- [ ] 无副作用探测  
- [ ] 测试证据  
