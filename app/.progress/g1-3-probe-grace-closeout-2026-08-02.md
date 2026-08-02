# G1-3 CLI 探测失败宽限窗 closeout（2026-08-02）

> Goal G1 执行层诚实性 · roadmap §4 队列第 6 刀（M1 首刀）。状态：**已关 ✅**

## 目标

CLI 瞬态探测失败不误报 runtime 缺失：最近一次成功后 60s 内探测失败继续 serve 上次结果且不缓存失败（学 hermes `_check_fn_cached`，registry.py:145），防 flaky 误报触发 enqueue 硬闸。

## 勘察结论（决定本刀形态）

**宽限窗逻辑已存在**（ebb84a4，bu02 readiness 切片已实现 `probeSuccessTTL` + `GRACE_PERIOD_MS=60_000`，`orchestration/readiness.ts:13-52`：成功写缓存；`installed=false` 或抛错两条路径 60s 内 serve 缓存；失败不缓存、每次全量重探）——roadmap 基线「CLI 探测无失败宽限窗」已过期。**真正缺口 = 零测试覆盖**（`readiness-execution-implemented.test.ts` 只回避缓存串扰，无任何用例断言宽限窗行为）。本刀 = 补全验收要求的单测 + 真实 runtime 回归。

## 改动

| 文件 | 改动 |
|---|---|
| `orchestration/readiness-grace-window.test.ts`（新） | 6 条用例，走**真实 registry backend 类**（pi + claude-code）× 真实 `computeAgentReadiness`：① 60s 内 installed=false 抖动 serve 成功（并断言 detect 仍被全量重探 → 失败不缓存）② 60s 内抛错不产生 error 状态 ③ 宽限过期如实报 runtime_missing ④ 宽限过期抛错报 error ⑤ 无成功先例立即如实上报 ⑥ 最近一次成功刷新窗口锚点 |

## 门禁

- 单文件 6/6 绿；server 全量 726 passed（90 文件）；monorepo 全量 1253 passed（含 shared 103 + web 424）；typecheck 全仓绿
- 时间控制：`vi.useFakeTimers({ toFake: ['Date'] })`（只伪造 Date.now，不动其他计时器）；每用例独立 agentId 防 `probeSuccessTTL` 模块级缓存串扰

## 真机验收

无需专项真机（宽限窗行为已在真实 backend class 回归中覆盖）；真机侧确认本机 4 个 runtime（pi / claude-code / opencode / cursor）探测全部 `installed=true`，`where grok` 找不到但 login-shell 兜底解析出 `~/.grok/bin/grok.exe`（v0.2.118，**grok 实际已安装**——供 G1-2/后续刀参考，勿再假设 grok 缺失）。

## 未做（后续刀）

- hermes 的正 TTL（30s 内不重探）未引入——roadmap 只要求失败宽限窗，正 TTL 改变每次探测的新鲜度语义，价值/成本不划算
- `probeSuccessTTL` 无清理机制（agentId 有限，无实际风险）
