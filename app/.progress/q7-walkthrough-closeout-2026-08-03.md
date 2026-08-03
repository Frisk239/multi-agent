# Q7 全链路走查 + 摩擦点清扫 — closeout（2026-08-03）

> 第七波「品质波」M4b 日用摩擦清扫 · 刀 7。真实走查 day0 → 建卡派活 → run 观察 → Memory 沉淀 → 设置诊断，产出摩擦点清单并修前 3 项（本 closeout 记录清单）。

## 走查路径（真实环境 e2e DB + 真机 grok/pi）

| 环节 | 做法 | 结果 |
|---|---|---|
| day0 / 引导 | 全新 DB 首启 → onboarding-status（onboarding 引导流 / 「稍后再说」关卡） | 走查发现：onboarding-status 每次导航拉取（layout OnboardingCard refetch 10s），顺序探测 5 CLI 3s+ → **摩擦点 3** |
| 建 Agent / 建卡派活 | API 建 agent（pi/grok）+ issue 指派 | 多刀重复验证 ✅ |
| run 观察 | run 详情页（真实 pi run 200 OK / grok run completed / 400 消息长 run） | 流式分块已合并（M4a）；长 run 渲染 452ms（M3 修复后）|
| Memory 沉淀 | run 完成后 run_message `[system] [memory] 自动沉淀经验到 Memory 库` + memory 页可达 | ✅ 自动沉淀链路可见 |
| 设置诊断 | Settings health tab + 运行健康卡（M2c「在途 x/上限 y」）+ runtimes 诊断 | ✅ |
| WS 实时 | dashboard「已连接」状态 | 走查发现 e2e（API 3011）下 WS 仍连默认 3001 →「实时连接已断开」banner → **摩擦点 1** |
| 模型选择 | AgentDetail / 创建向导模型下拉（grok 静态列表） | 真机验证：grok 0.2.118 拒绝 grok-3 / grok-3-mini / grok-composer-2.5-fast（unknown model id），仅 grok-4.5 可用 → 下拉给出不可用项 = 选错必失败 → **摩擦点 2** |

## 摩擦点清单（走查产出）

1. **WS 地址与 API 端口配置不一致**：`ws.ts` 硬编码 `ws://localhost:3001/ws`（NEXT_PUBLIC_WS_URL 未设时），API 指向其他端口（e2e/自部署 3011）时 WS 连默认 3001 失败 → 全站「实时连接已断开」banner。
2. **grok 模型下拉含不可用 id**：`listGrokStaticModels` 列出 4 个模型，真机仅 grok-4.5 可用；用户从下拉选 grok-3/grok-3-mini/grok-composer-2.5-fast → run 诚实失败（不可行动）。
3. **onboarding-status 顺序探测 5 CLI（3s+）**：layout 层 OnboardingCard 每次导航拉取（refetch 10s），顺序 spawn 探测拖慢首屏。

## 修复（前 3 项）

| # | 修复 | 文件 | 验证 |
|---|---|---|---|
| 1 | `deriveWsBase()`：WS 地址从 NEXT_PUBLIC_API_URL 推导（同 host:port，http→ws；NEXT_PUBLIC_WS_URL 显式优先） | `web/lib/ws.ts` | e2e 3011 环境「实时连接已断开」banner 消失；+4 用例（api 推导 / https→wss / 显式优先 / 默认 3001）|
| 2 | `listGrokStaticModels` 只列真机验证可用模型（grok-4.5 + 注释说明被拒 id） | `server/src/runtime/grok.ts` | 真机 2 回合：grok-3 / grok-composer-2.5-fast 均被拒（unknown model id）→ 从列表移除 |
| 3 | onboarding-status 复用 `detectRuntimeCached`（M3 的并发 + 30s TTL） | `server/src/routes/settings.ts` | **onboarding-status 3s+ → 0.21s（-93%）** |

## 测试与门禁

- web：ws 22/22（+4 deriveWsBase）、OnboardingCard/day0 28/28 绿
- server：settings（runtime-detect-cache / onboarding / memory-health）+ grok 25/25 绿
- 真机证据：grok 2 模型验证 run 诚实失败（摩擦点 2 依据）；onboarding-status 0.21s 实测

## 决策记录

1. **修 onboarding-status 复用缓存而非新写**：与 M3 同源（顺序 detect 5 CLI），复用 detectRuntimeCached 保持单点；runtimes 诊断页仍实时。
2. **模型列表只留验证可用项**：宁可列表短（用户可手填自定义 id）也不给必失败的选项——诚实优先（G1 执行层诚实性精神延续）。
3. **WS 显式 env 优先**：兼容既有 NEXT_PUBLIC_WS_URL 配置，推导是默认行为。

## 已知边界（后续）

- grok 可用模型集随版本演进（当前 grok-4.5 唯一验证可用）；新版本可用后需重新真机验证更新静态列表
- e2e 验收环境需手动 seed workspace 行（migrate 不含 seed）——测试基建摩擦，非产品路径

## 测试计数

- web：ws 22（+4）/ OnboardingCard 等 28 绿；server：settings+grok 25 绿
- 全量门禁在最终统一跑
