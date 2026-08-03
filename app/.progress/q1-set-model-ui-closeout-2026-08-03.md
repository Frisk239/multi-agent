# Q1 set_model UI 闭环 — closeout（2026-08-03）

> 第七波「品质波」M1 ACP 边界闭合 · 刀 1：set_model 从「仅 API/测试」到「UI 可切换、真机生效、回读可见」。G1-2 closeout 记录的已知边界「set_model UI 后置（需 get_available_models 接入）」正式关闭。

## 勘察结论（开工先验证现状）

| 债项 | 勘察结果 |
|---|---|
| Agent 创建/编辑模型选择器 | **已存在**（AgentBuilderWizard + AgentDetailPage，接 `GET /api/runtimes/:id/models` → listRuntimeModels：grok 静态列表 / opencode CLI 发现 / claude 静态 / cursor 尽力探测 / **pi 为空**）——G1-2 closeout 写「缺 UI 模型选择器」时点已过期 |
| run 详情页运行中命令 | 已有 steer/compact（G1-1，pi running），**缺 set_model**（后端 `POST /api/runs/:runId/command` + zod 校验 + 200/404/409/501/502 契约已就绪，run-command.test.ts:166 已测 200 透传） |
| grok 模型绑定 | 会话启动时 `session/set_model`（grok.ts:324，`input.model` → set_model，同模型跳过）——运行中 set_model 诚实 501（ACP v1 无对应方法） |

**拍板：** 补 RunDetailPage 运行中 set_model 控件（pi mid-run 语义，与 steer/compact 同区同风格）；grok 的「UI 切换真实生效」走 AgentDetail 模型编辑 → 会话绑定 → run.model 回读路径（已存在 UI + 真机验证本刀补齐）。

## 改动

| 文件 | 改动 |
|---|---|
| `web/components/RunModelSwitcher.tsx`（新） | 运行中 set_model 切换：下拉 = runtime models catalog + 手填兜底（pi 无 catalog）；`parseModelId` 拆分 provider/modelId 对齐上游 pi rpc-types.ts:32（`provider/modelId` 前缀拆分，无前缀回退 runtime）；Enter 提交；发送按钮空值禁用 |
| `web/components/RunDetailPage.tsx` | pi running 命令区（steer 旁）集成 `<RunModelSwitcher runId runtime currentModel={run.model} />` |
| `web/components/RunModelSwitcher.test.tsx`（新） | 5 用例：catalog 渲染+当前模型选中 / 选模型发送（provider 拆分）/ 手填无前缀回退 runtime + Enter / 空输入禁用 / catalog 无匹配显示自定义项 |

复用零后端改动：`useSendRunCommand` 已含 set_model 分支（toast「已请求切换模型」+ invalidate runs）。

## 真机验证证据（本机 pi 0.83.0 + grok 0.2.118，独立验收环境 e2e-q1.db）

| 步骤 | 结果 |
|---|---|
| pi agent + 长任务 issue（ping -n 120，保持 running）| run running；run 详情页命令区渲染 set_model 控件（截图 q1-set-model-controls.png）|
| 手填 pi 真实模型 `moonshotai-cn/kimi-k2-0711-preview`（来自 ~/.pi/agent/models-store.json）→ 切换 | **POST /api/runs/:id/command → 200 OK**，pi 接受（q1-set-model-sent.png）|
| grok agent（model=null）回合 1 | completed；run.model=None（CLI 默认）|
| PATCH agent.model=`grok-3-mini`（AgentDetail UI 保存路径）→ 回合 2 | **诚实失败**：`grok 无法切换到模型 grok-3-mini：session/set_model: Invalid params (code=-32602, data=unknown model id)` —— 上游拒绝的 fail-closed 路径（选择器选项并非全部可用，选错不静默）|
| PATCH agent.model=`grok-4.5`（静态列表默认项）→ 回合 3 | **completed**；run.model=`grok-4.5` 回读；run 详情页「模型 grok-4.5 · thinking CLI 默认」（q1-grok-model-roundtrip.png）|

**闭环达成：** UI 切换（AgentDetail 编辑 / RunModelSwitcher 运行中）→ 真实生效（pi mid-run RPC 200 / grok session/set_model 绑定）→ 回读（run.model + 详情页展示）。

## 测试与门禁

- `pnpm typecheck`（web）全绿
- web 全量 **447/447**（基线 442 + 新增 5）——60→63 文件
- 新增：RunModelSwitcher 5 用例
- Playwright 证据 3 张：`.scratch/q1-set-model/`

## 决策记录

1. **provider/modelId 拆分**：模型 id 形如 `provider/modelId` 时拆分（对齐上游 pi rpc-types.ts:32），无前缀回退 runtime——真机验证了 `moonshotai-cn/kimi-k2-0711-preview` 正确到达 pi。
2. **控件只挂在 pi running**：grok/claude/opencode/cursor 运行中 set_model 诚实 501（后端已有语义），UI 不渲染无意义入口（与 steer 区一致）。
3. **catalog 空时手填兜底**：pi 无稳定 models 列表（list-models 返回 empty），与 AgentDetailPage 同模式。
4. **grok 静态列表非全部可用**：真机证明 `grok-3-mini` 被 grok 0.2.118 拒绝（unknown model id）而 `grok-4.5` 可用——列表是「常用 id」而非「保证可用」，失败走诚实提示（不静默）。此信息写回 listGrokStaticModels 注释，后续刀可考虑用 `get_available_models`（ACP 无此方法，pi 有）校准。

## 已知边界（后续刀）

- grok 静态模型列表含不可用 id（`grok-3-mini` 实测被拒）——真实可用集需 grok 侧确认，本刀诚实失败已覆盖
- run.model 快照语义：mid-run set_model 不改快照（快照=启动时配置），回读以命令回执为准

## 测试计数

- web：447/447（新增 5）；server/shared 未动
- `pnpm typecheck`（web）绿
