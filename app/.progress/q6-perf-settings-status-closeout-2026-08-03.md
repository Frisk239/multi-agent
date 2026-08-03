# Q6 规模与性能：settings/status 3s 瓶颈修复 — closeout（2026-08-03）

> 第七波「品质波」M3 规模与性能 · 刀 6。profile 先行：造大数据（1200 issue + 400 消息长 run）实测 3 条路径，锁定全局最明显瓶颈 `/api/settings/status` 3.1-3.5s（每页布局层都调）→ 并发探测 + TTL 缓存修复，before/after 数字进本 closeout。

## 基准（profile 先行，1200 issue + 400 消息长 run 实测）

| 路径 | 数据量 | 实测 | 结论 |
|---|---|---|---|
| 看板 | 1200 issue | domComplete 502ms · 滚动 242fps | ✅ 列虚拟化（KanbanColumn useVirtualizer）已覆盖，非瓶颈 |
| 列表视图 | 1200 issue | domComplete 418ms | ✅ 行虚拟化（IssueListView）已覆盖，非瓶颈 |
| 长 run 详情 | 400 消息 | domComplete 1239ms | ⚠️ 偏慢（但 tool pair 已默认折叠） |
| **`/api/settings/status`** | — | **3.14s / 3.35s / 3.49s（三次实测）** | ❌ **全局瓶颈：每页布局都调，顺序探测 5 CLI** |

**瓶颈定位**：`buildSettingsStatus` 里 `for (const b of allBackends()) { await b.detect() }` —— 顺序 spawn 探测 claude-code/opencode/cursor/grok/pi 5 个 CLI 版本（Windows 下每次 3s+），且该端点为全局布局请求（每页首屏都等它）。其余检查（cwd/memory/env）都是内存操作。

## 修复

| 文件 | 改动 |
|---|---|
| `server/src/routes/settings.ts` | `detectRuntimeCached(b)`：runtime detect 结果 **30s TTL 模块级缓存**（失败结果同样缓存——CLI 安装态 30s 内不突变）；buildSettingsStatus 的 runtimes 检查改 **Promise.all 并发探测**。runtimes 诊断页（另一处 allBackends 循环）保持实时探测，不受缓存影响 |
| `server/src/routes/settings.runtime-detect-cache.test.ts`（新） | 1 用例：同 TTL 内 3 次 buildSettingsStatus 只探测 2 个 backend 各 1 次（缓存命中）+ 检查项结果稳定 |

## before / after

| 指标 | before | after | 提升 |
|---|---|---|---|
| `/api/settings/status` 冷调用（首次探测） | 3.14s | **1.53s** | 并发探测 -51% |
| `/api/settings/status` 热调用（TTL 内） | 3.35s | **0.21s** | 缓存 -94% |
| 长 run 详情页 domComplete | 1239ms | **452ms** | 页面整体 -64% |

真机验证环境：1200 issue + 400 消息 e2e DB，server :3011 + web :3000，curl 计时 + PerformanceNavigationTiming。

## 测试与门禁

- server 全量 **902/902**（基线 889 + Q2 12 + Q6 1）；新增缓存用例 1
- `tsc --noEmit`（server）绿
- settings.memory-health / onboarding 测试未受影响（4/4 绿）

## 决策记录

1. **修全局端点是最高杠杆**：看板/列表虚拟化已良好（502/418ms），长 run 详情 1239ms 主要被 settings/status 拖慢（布局层阻塞）——修根因后页面整体 452ms。
2. **缓存只加在 buildSettingsStatus**：runtimes 诊断页保持实时探测（用户主动看诊断要最新状态）；30s TTL 足够吞掉「页面切换」级重复调用。
3. **失败结果也缓存**：CLI 未安装/探测失败结果缓存 30s，避免断连场景反复 spawn 超时；安装态 30s 内突变可接受（runtimes 页可刷新）。
4. **M3 只修测出来的瓶颈**：未做预防性优化（如 run 详情虚拟化——实测非瓶颈后不动）。

## 测试计数

- server：902/902（+1 缓存用例）；web/shared 在终验统一跑
