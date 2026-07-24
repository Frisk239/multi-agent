# 功能缺口 + 体验缺口全景分析 · 2026-07-24

> **调研方法:** 全量读取本仓代码 + Multica 源码深读 + 真站对照 + 12 参考项目交叉验证  
> **北星:** 本地版 Multica 控制台体验（日常可用、可演进），非 daemon/云协议 1:1  
> **前置:** [gap-research-3d-2026-07-24.md](./gap-research-3d-2026-07-24.md) · [multica-gap-live-2026-07-19.md](./multica-gap-live-2026-07-19.md) · [ux-gap-multica-2026-07-21.md](./ux-gap-multica-2026-07-21.md)

---

## 完成态评估

**主航道日用覆盖率：~90%。** 剩余差距不在"能不能用"而在"用着顺不顺"。

### 已对齐清单（含近期交付）

| 路径 | 状态 | 代表 |
|---|---|---|
| 看板 / Issue / 指派 / 标签 / 筛选深链 / 子 issue / 订阅 / PR URL | ✅ | S01-S02 · G1-G6 |
| 多 Backend 执行 + model 绑定 + thinking level + run 列表/轨迹 | ✅ | S03 · G22 · DS4 |
| 小队 leader + briefing + mention + 委派链路可视化 | ✅ | S04 · Phase2 Slice B |
| Chat 多轮 history + 项目绑定 + 隔离 cwd + Helper FAB | ✅ | F2 · B1 · G9-G11 |
| Wiki 编译 / query / dead 重试 / per-project 根 | ✅ | S06-S08 · DS3 |
| Memory 双后端 + 列表/搜索/批量删除 + 运行自动沉淀 | ✅ | S09-S11 · Phase2 Slice C |
| Inbox 三栏详情 + DM 追问 + 归档 + kind 筛选 | ✅ | G7-G8 · G21 · Phase1 Slice 2 |
| Automation 规则 + 模板画廊 + 失败筛选 | ✅ | bu05 · G15 |
| Project 容器 + localPath + Git dirty 探针 + cwd 路由 | ✅ | G16 · Phase1 Slice 3 |
| Settings 诊断 + cwd 持久化 + 健康卡 + Live 探针 | ✅ | bu04 · Phase2 Slice D |
| UX Trust A-D (cwd 诚实/旁路同闸/韧性/手感) | ✅ | Wave A-D |
| PriorWorkDir + Session 继承（rerun） | ✅ | Phase1 Slice 4 |
| Token 用量卡片（Issue 级） | ✅ | Phase2 Slice A |
| 用量中心（聚合）+ Agent 工作仪表盘 + 能力 Tab | ✅ | G12-G17 |

### 超车保持（Multica 真站不具备）

- Wiki 编译+query+dead 批量重试
- Memory 双后端+批量+运行自动沉淀
- Settings 健康卡矩阵+Live 进程探针
- Runs Mission Control+批量取消+收尸
- CmdK 命令面板
- Git dirty 探针+派活安全闸
- 失败/ready 运营深链网

---

## 功能缺口清单

### 🔴 P0 — 核心工作流深度

| ID | 缺口 | Multica 参照 | 建议切片 |
|---|---|---|---|
| GAP-01 | **Activity Log（结构化活动时间线）** | Issue 详情完整事件流：状态变更+评论+run+mention | `activity-log-timeline` |
| GAP-02 | **Onboarding 首启向导** | `multica setup` CLI 自动探测+引导 | `onboarding-wizard` |
| GAP-03 | **Issue 列表视图** | 「筛选·手动·看板」三视图 | `issue-list-view` |

### 🟡 P1 — 体验深度

| ID | 缺口 | Multica/Hermes 参照 | 建议切片 |
|---|---|---|---|
| GAP-04 | **Agent 30 天统计仪表盘** | 成功率/平均耗时/失败数 | `agent-stats-dashboard` |
| GAP-05 | **Issue 自定义字段** | 「添加字段」按钮 | `issue-custom-fields` |
| GAP-06 | **流式实时反馈加深** | 色块实时流 + partial 文本 | `streaming-deep` |
| GAP-07 | **Keyboard Shortcuts 体系** | 快捷键设置页 | `keyboard-shortcuts` |
| GAP-08 | **通知偏好/细粒度订阅** | 通知设置+issue级 | `notification-preferences` |
| GAP-09 | **Memory 向量检索自动注入 prompt** | Hermes `prefetch()` | `memory-auto-inject` |
| GAP-10 | **RuntimeEvent 统一事件协议** | `TaskMessagePayload` | `runtime-event-protocol` |

### 🟢 P2 — 纵深

| ID | 缺口 |
|---|---|
| GAP-11 | Agent 委派子代理（Delegate）|
| GAP-12 | Tool Registry 可视化 |
| GAP-13 | Context Compression / 长对话压缩 |
| GAP-14 | Wiki 交叉项目索引 |
| GAP-15 | Session 持久化与迁移（跨 runtime）|
| GAP-16 | API Token（本地 CLI `ma` 用）|
| GAP-17 | 工作区成员协作设置 |

---

## 体验缺口清单

| ID | 体验点 | 现状 | 目标 |
|---|---|---|---|
| UX-A | 空态引导 | 多页面仅「暂无数据」| 图示+引导动作 |
| UX-B | 表格密度 | 间距偏大 | 三档可选 |
| UX-C | Dark Mode 打磨 | 有但边角不一致 | 全局 token 统一 |
| UX-D | 响应式/窄屏 | 桌面优化 | 1024px 断点可用 |
| UX-E | Loading 骨架屏 | 部分 spinner | 关键页面骨架屏 |
| UX-F | 批量操作 | 有 bulk cancel/read | 看板 issue 批量 |
| UX-G | 国际化就绪 | 中英混杂 | 中文为主统一 |

---

## 下一阶段切片计划（6 刀）

### 推荐迭代路径

```
Slice 1: Issue 列表视图       (GAP-03) ← P0 高感知低风险
    ↓
Slice 2: Activity Log 时间线   (GAP-01) ← P0 结构化 schema 变更
    ↓
Slice 3: Agent 统计仪表盘     (GAP-04) ← P1 数据驱动纯聚合
    ↓
Slice 4: Memory 注入 Prompt   (GAP-09) ← P1 知识闭环关键
    ↓
Slice 5: Onboarding 向导      (GAP-02) ← P1 首次体验
    ↓
Slice 6: RuntimeEvent 协议    (GAP-10) ← P1/P2 技术基建
```

### 各切片摘要

| # | 切片 | 复杂度 | 触达范围 | 关键技术点 |
|---|---|---|---|---|
| 1 | Issue 列表视图 | 中 | web 为主 | `IssueListView` + 视图切换 toggle + 排序/分组 |
| 2 | Activity Log | 中 | schema+server+web | `activity_log` 表 + 多态 actor + 事件枚举 |
| 3 | Agent 统计 | 低-中 | server 聚合+web 图表 | 30 天 SQL 聚合 + 简单图表渲染 |
| 4 | Memory 注入 | 中 | server prompt | `memoryManager.search` → prompt 上下文 |
| 5 | Onboarding | 中 | web modal+server API | 状态检测 API + 引导步骤 |
| 6 | RuntimeEvent | 高 | shared+server+web | 统一 `RuntimeEvent` 类型 + adapter normalize |

### 人可调整

- Slice 1-2 强烈建议优先（最高感知差距）
- Slice 3-5 可按心情重排
- Slice 6 可拆成多刀或后置
- 切片之间无硬依赖，可并行或跳做

---

## 刻意不做（仍有效）

| 边界 | 原因 |
|---|---|
| 云 webhook / 多租户 / Redis | 宪法 |
| Daemon 协议 1:1 / 「添加电脑」 | 本地 CLI 即可 |
| 密钥入库 / UI 写密钥 | ADR 0003 |
| 跨 runtime session 迁移 | 成本过高 |
| 大规模生产运营 BI | 非本阶段 |
