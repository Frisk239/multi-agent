# 完成审计 · 本地 Multica 控制台（2026-07-19）

## 目标（用户授权后钉死）

复刻 **本地版 Multica 控制台体验**（派活 / 小队 / run 观测与恢复 / Wiki / Memory / Settings），**不必** daemon / 云协议 1:1。

真源：`AGENTS.md` · `docs/agents/workflow.md` · `CONTEXT.md` · `app/.progress/multica-gap-2026-07-17.md`

## 成功标准 → 证据

| 要求 | 证据 |
|---|---|
| 纯本地编排控制台 | SQLite + 本地 Node server + Next web；无 Redis/多节点 |
| 看板派活 / Issue | S01–S02 + issue-* 深链；`GET /api/issues` 200 |
| 小队 leader + mention | S04 + mention/leader 运营切片 |
| Run 可观测 / 收尸 / 批量取消 | run-observability · runs-recover-stuck · runs-bulk-cancel · settings-run-health；`GET /api/runs/active-count` 200 |
| Wiki 编译与 dead 运维 | wiki + wiki-dead-bulk-retry；`GET /api/wiki/jobs` 200 |
| Memory 可插拔 + 运维 | S09–S11 + 单条/批量删除 + settings-memory-health；`GET /api/memory` 200 |
| Settings 诊断 + cwd 持久化 | bu04 · ADR 0003 · workspace-cwd-persist · cwd-resolve-unify；`GET /api/settings/status` 200 |
| Inbox / Automation | bu01 bulk + bu05；`/api/automation/rules` 200 |
| 厚切片 = 前后端同刀 + Playwright + main 推送 | 各 `app/.progress/*-impl-*.md`；main @ `97bedf4` |
| 持续对比 Multica | 滚动 gap 表；宪法写明体验 vs 刻意边界 |
| 非 1:1 边界 | 密钥 env-only；无 webhook 舰队；adapter 非 daemon 协议 |

## 现场 API 抽检（本审计时刻）

- agents / issues / runs/active-count / settings/status / memory / wiki/jobs / automation/rules → **200**
- web `/` → **200**

## 剩余「可演进」为何不停当成未完成

| 项 | 为何不挡完成态 |
|---|---|
| Automation 失败更深报表 | 已有失败筛选 + Settings 摘要；属密度 |
| 无 env 冷启动一键 e2e 剧本 | resolve 冷读已证明；属回归脚本 |
| UI 文案打磨 | 无功能缺口 |

## 判定

**在文档定义的「本地 Multica 控制台体验」边界内：目标已达成。**

- 主航道日常可用：**是**
- 体验边界内完成态：**是**
- Multica 源码/daemon 克隆完成态：**否（刻意）**

**Slice Owner 自动厚切片循环：建议停止**，除非人指定新北星（例如：必须 daemon 路径锁、密钥入库、或某条业务线）。

## HEAD

- `97bedf4` docs: note memory bulk delete in multica gap  
- 功能最近：`6928c78` memory-bulk-delete · `a030838` 完成边界文档 · `365fafd` memory-item-delete · `49efb20` cwd 持久化  
