# Multica 对照差距表 · 滚动（2026-07-19）

> 目标：**本地版 Multica 控制台体验**（日常可用），**非** daemon/云协议 1:1。  
> HEAD 随 main 滚动；细 commit 列表见 git log / 各 `*-impl-*.md`。

## 已对齐（主航道）

| 路径 | 状态 | 代表切片 |
|---|---|---|
| 看板 / Issue / 指派 / 标签 / 筛选深链 | ✅ | S01–S02 · issue-* · board-* |
| 多 Backend 执行 + run 列表/轨迹/再执行 | ✅ | S03 · run-observability |
| 小队 leader + briefing + mention | ✅ | S04 · mention-* · leader-* |
| Wiki 编译 / dead 重试 / 健康 | ✅ | S06–S08 · wiki-* · wiki-dead-bulk-retry |
| Memory 可插拔 + 列表/搜索/单条与批量删除 | ✅ | S09–S11 · memory-item-delete · memory-bulk-delete |
| Inbox / 失败恢复 / bulk 已读 | ✅ | bu01 · inbox-* |
| Agent readiness / 运营恢复链 | ✅ | bu02 · *-readiness · *-recovery |
| Quick-create / Automation | ✅ | bu03 · bu05 |
| Settings 诊断 + cwd 持久化 | ✅ | bu04 · workspace-cwd-persist · ADR 0003 |
| Run 收尸 / 批量取消 / 健康阈值 | ✅ | runs-recover-stuck · runs-bulk-cancel · settings-run-health |
| Settings Wiki/Auto/Memory 健康卡 | ✅ | settings-wiki-auto-health · settings-memory-health |

## 体验可演进（可选下一刀，非挡完成态）

| 缺口 | 说明 |
|---|---|
| **G21 Inbox 交互加深** | 路由已有；要做详情回复/私信/Markdown/可选 Helper 第三栏（见 live gap） |
| **G22 Agent model 绑定** | **✅ 绑定主路径已交**；**2026-07-22 residual honesty 闭合**（run 快照 `0031` + create/Detail 对称 + grok print `--effort` + RunDetail 展示）见 `g22-model-path-impl-1.md` / research。非目标：opencode models 缓存、pi |
| **G23 运行事件时间线** | 有 RunTrace 扁平列表；要对齐真站 tool 事件弹层 |
| Automation 失败深运营 / run 明细 | 已有规则失败筛选与健康摘要 |
| 无 env 全进程冷启动 e2e 剧本 | resolve 冷读已覆盖；可再写一键脚本 |
| UI 密度 / 空态文案 | 持续打磨 |

## 刻意不做（非债 · 勿当完成态 blocker）

| 边界 | 原因 |
|---|---|
| Wiki LLM / embedding 密钥写 DB/UI | 安全；env-only（宪法） |
| 云 webhook / 多租户 / Redis | 纯本地宪法 |
| Multica daemon 协议 1:1 | Backend adapter 学接口不学进程模型 |
| `waiting_local_directory` 路径锁状态机 | 单 workspace cwd 足够日常 |
| 大规模生产运营 BI | 非本产品阶段 |

## 达标判断

| 维度 | 判断 |
|---|---|
| **主航道日常可用** | **是** |
| **本地 Multica 控制台完成态** | **是（体验边界内）** — 派活→执行→观测→恢复→Wiki/Memory→Settings 可闭环 |
| **Multica 源码级克隆完成态** | **否（刻意）** |

继续策略：差距表「体验可演进」**仅在人点名或新北星时**再开刀；**禁止**把「刻意不做」写成必须还清的债。  
**2026-07-19：** 见 [local-multica-completion-audit-2026-07-19.md](./local-multica-completion-audit-2026-07-19.md) — Owner 默认循环 **停**。
