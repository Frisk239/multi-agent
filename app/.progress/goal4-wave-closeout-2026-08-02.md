# Goal 第四波（运营闭环 + 最终打磨）最终 closeout —— 2026-08-02/03

**波次：** 运营闭环 + 最终打磨（M1 半截补全 → M2 运营 → M3 知识 → M4 收尾）
**状态：** M1–M4 全部关刀，全量门禁绿，Playwright 7/7 PASS，main 已推送（6 commits）

## 本波关刀清单

| 刀 | Goal | commit | closeout |
|---|---|---|---|
| G3-4b 执行层注入（envVars/customArgs spawn 生效） | G3 | e9ac5d9 | [g34b-env-inject](app/.progress/g34b-env-inject-closeout-2026-08-02.md) |
| G5-5 系统/桌面通知（零依赖 PowerShell + Settings 开关默认关） | G5 | a2511a3 | [g55-system-notify](app/.progress/g55-system-notify-closeout-2026-08-02.md) |
| G5-6 运营统计（cycle time / 利用率 / 失败率·改派趋势） | G5 | 3c30118 | [g56-ops-analytics](app/.progress/g56-ops-analytics-closeout-2026-08-02.md) |
| G4-5b Wiki health 一键报告（已闭环确认）+ backlink | G4 | 8da8297 | [g45b-wiki-health-backlink](app/.progress/g45b-wiki-health-backlink-closeout-2026-08-02.md) |
| G5-7 看板快照 JSON 导入导出 | G5 | f84fb37 | [g57-issue-json-export](app/.progress/g57-issue-json-export-closeout-2026-08-02.md) |
| G3-7 二阶体验 ×2（CmdK 高亮 + 失败卡一键重试） | G3 | fc01627 | [g37-ux-polish](app/.progress/g37-ux-polish-closeout-2026-08-02.md) |

（+ 本 closeout 附 e2e 脚本与证据 log，fc01627 之后未提交部分）

## 验收标准对照（全量门禁）

| 验收项 | 证据 |
|---|---|
| envVars/customArgs 子进程真实生效 | printenv 实证：grok run `7e618c82` completed，报告 `MA_DEMO_ENV=g34b-demo-123` 一致；五 backend 形态核对表见 g34b closeout |
| 系统通知可选可配、run 终态/inbox 触发、Settings 开关、无云端 | system-notify 零依赖 PowerShell 弹窗；开关默认关 + env 强制开；实证 run_completed inbox → 弹窗无错；Playwright g5-5 PASS |
| 运营统计端点可用（≥2 项落地显示） | /api/analytics/ops：cycle time（契约测试 300s 断言）+ 利用率（真实库 54.7%）+ 按日趋势（30 天连续）；UsagePage 运营区渲染（Playwright g5-6 PASS） |
| Wiki health 一键报告可跑 + backlink 可见 | /api/wiki/health 真实库 8 页报告；backlinks 反查实证（临时引用页命中 → 清理后清空）；UI 区渲染（Playwright g4-5b×2 PASS） |
| M4：G3-7 ≥2 项落地 + G5-7 自述 | G3-7×2（CmdK 高亮 4 用例 + 失败卡一键重试）；G5-7 契约测试 + 344→3 roundtrip 实证 |
| 全程 typecheck 绿 + 每刀有测试 + Playwright 证据 + 全量 pnpm test 绿（含 shared）+ main 已推送 | **typecheck 全绿**；**pnpm test：shared 6 文件/121 · server 98 文件/831 · web 62 文件/442 = 1394 用例全绿**；**Playwright 冒烟 7/7 PASS**（[logs/final-wave-smoke](logs/final-wave-smoke-2026-08-03T00-21-37-267Z.log)）；main 6 commits 全推 |

## Playwright 冒烟 7 项（e2e-g5-final-wave.mts）

g5-5-settings-switch（开关存在 + 默认关）· g5-6-usage-ops（cycle/util/trend 三卡）· g4-5b-health-panel（徽标）· g4-5b-backlinks（反查区渲染）· g5-7-kanban-json（导出/导入按钮）· g3-7-cmdk-highlight（输入 Iss → 9 处高亮）· g3-7-card-retry（失败卡重试按钮）—— **7 PASS / 0 FAIL / 0 SKIP**

## 下一刀建议

G1–G5 池仅剩 **G1-2 A 分支（ACP stdio 客户端，port multica grok.go）** 大工程——按目标边界独立开 goal，不塞本波。可另收的浅项：G2-5 全局并发配额 / G1-5 pgvector 软回退可观测（本波 M4 未取，价值低）。
