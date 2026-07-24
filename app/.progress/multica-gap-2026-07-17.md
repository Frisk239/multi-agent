# Multica 对照差距表 · 滚动（2026-07-24）

> 目标：**本地版 Multica 控制台体验**（日常可用），**非** daemon/云协议 1:1。  
> HEAD 随 main 滚动；细 commit 列表见 git log / 各 `*-impl-*.md`。  
> **2026-07-24 全量审计：** [gap-analysis-2026-07-24.md](./gap-analysis-2026-07-24.md)

## 已对齐（主航道 · ~90% 日用覆盖）

| 路径 | 状态 | 代表切片 |
|---|---|---|
| 看板 / Issue / 指派 / 标签 / 筛选深链 / 子 issue / 订阅 / PR URL | ✅ | S01–S02 · G1–G6 |
| 多 Backend 执行 + model 绑定 + thinking level + run 列表/轨迹 | ✅ | S03 · G22 · DS4 |
| 小队 leader + briefing + mention + 委派链路可视化 | ✅ | S04 · Phase2 Slice B |
| Chat 多轮 history + 项目绑定 + 隔离 cwd + Helper FAB | ✅ | F2 · B1 · G9–G11 |
| Wiki 编译 / query / dead 重试 / per-project 根 | ✅ | S06–S08 · DS3 · ADR 0005 |
| Memory 双后端 + 列表/搜索/批量删除 + 运行自动沉淀 | ✅ | S09–S11 · Phase2 Slice C |
| Inbox 三栏详情 + DM 追问 + 归档 + kind 筛选 | ✅ | bu01 · G7–G8 · G21 |
| Agent readiness / 工作仪表盘 / 能力 Tab / 运营恢复链 | ✅ | bu02 · G12–G14 |
| Quick-create / Automation + 模板画廊 | ✅ | bu03 · bu05 · G15 |
| Settings 诊断 + cwd 持久化 + 健康卡 + Live 探针 | ✅ | bu04 · Phase2 Slice D |
| Run 收尸 / 批量取消 / 健康阈值 | ✅ | runs-recover-stuck · runs-bulk-cancel |
| Project 容器 + localPath + Git dirty 探针 + cwd 路由 | ✅ | G16 · Phase1 Slice 3 |
| UX Trust A–D (cwd 诚实 / 旁路同闸 / 韧性 / 手感) | ✅ | Wave A–D |
| PriorWorkDir + Session 继承 (rerun) | ✅ | Phase1 Slice 4 |
| Token 用量卡片 + 用量中心 + 用户画像 | ✅ | Phase2 Slice A · G17–G18 |

## 体验可演进（下一阶段切片池 · 2026-07-24 审计）

| ID | 缺口 | 优先级 | 说明 |
|---|---|---|---|
| **GAP-03** | **Issue 列表视图** | P0 | Multica 有筛选/手动/看板三视图；本仓仅看板 |
| **GAP-01** | **Activity Log 结构化时间线** | P0 | Issue 详情缺状态变更审计事件流 |
| **GAP-02** | **Onboarding 首启向导** | P1 | 新用户无引导 |
| **GAP-04** | **Agent 30 天统计仪表盘** | P1 | 缺成功率/耗时聚合图表 |
| **GAP-09** | **Memory 向量检索自动注入 prompt** | P1 | 知识闭环关键一步（学 Hermes prefetch） |
| **GAP-10** | **RuntimeEvent 统一事件协议** | P1/P2 | 各 backend 事件格式各异 |
| GAP-05–08 | 自定义字段 / 流式加深 / 快捷键 / 通知偏好 | P1–P2 | 体验纵深 |
| GAP-11–17 | 委派子代理 / Tool Registry / 长对话压缩 / … | P2 | 远期 |

详见 [gap-analysis-2026-07-24.md](./gap-analysis-2026-07-24.md) 完整清单 + 切片计划。

## 刻意不做（非债 · 勿当完成态 blocker）

| 边界 | 原因 |
|---|---|
| Wiki LLM / embedding 密钥写 DB/UI | 安全；env-only（宪法） |
| 云 webhook / 多租户 / Redis | 纯本地宪法 |
| Multica daemon 协议 1:1 | Backend adapter 学接口不学进程模型 |
| 密钥入库 / UI 写密钥 | ADR 0003 |
| 大规模生产运营 BI | 非本产品阶段 |

## 达标判断

| 维度 | 判断 |
|---|---|
| **主航道日常可用** | **是** |
| **本地 Multica 控制台完成态** | **是（体验边界内）** — 派活→执行→观测→恢复→Wiki/Memory→Settings 可闭环 |
| **Multica 源码级克隆完成态** | **否（刻意）** |

**继续策略（2026-07-24）：** 体验可演进区按 Slice Owner 自动迭代；切片来源见差距审计。刻意不做仍有效。
