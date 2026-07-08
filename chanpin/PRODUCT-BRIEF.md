# Product Brief — 毕设 Multi-Agent 平台

> product-lens 诊断 · 2026-07-08 · 队长签核

## 7 问诊断

| # | 问题 | 回答 |
|---|------|------|
| 1 | 为谁做？ | **单人开发者 / 毕设作者**（本地自用），答辩受众为导师与评审；非 SaaS 多租户用户 |
| 2 | 痛点？ | 现有 Agent 工具碎片化：编排（Multica）、执行（Hermes/Pi）、Wiki（llm-wiki）、记忆（mem0）各自独立；缺「Issue 驱动 + 小队委派 + 项目 Wiki + 跨会话记忆」的一体化本地控制台 |
| 3 | 为什么现在？ | Multica/Hermes/Pi 源码已深读；TS 全栈 + Pi SDK 嵌入路径已验证（见 `design/synthesis.md`）；毕设周期约 1 年，Phase 0 可立即启动 |
| 4 | 10 星版本？ | 纯本地 Multica 级编排 + 全 CLI 绑定 + 编译式 Wiki + 可插拔 Memory + Autopilot + MCP + 完整 ablation 实验数据 |
| 5 | MVP（本次 chanpin 交付范围） | **PRD + 可交互原型**，覆盖 Must 级：Trello 看板 Issue、Squad 委派、Agent 定义与 Skill URL 导入、Multica 式三栏布局；**不含**真实后端/CLI 执行 |
| 6 | 反目标 | ❌ 云端托管 ❌ 20+ 消息 gateway ❌ 企业 RBAC ❌ 14 CLI 全量 ❌ 本次交付写 `app/` 生产代码 |
| 7 | 怎么算成功？ | `chanpin/` 内有完整 PRD+RTM、原型可点通 Must 路径、导师可 10 分钟内理解架构与差异化 |

## MoSCoW（PRD / 原型 Must 锁定）

> **V1**（2026-07-08）：功能骨架 — 已交付 PRD/RTM + V1 原型。  
> **V2**（2026-07-08 队长反馈）：Multica UI Replica — 完整 IA + 视觉保真 + 全页面 shell。  
> 真源：[`multica-ui-replica-inventory.md`](docs/prd/multica-ui-replica-inventory.md)（逐张 Read 18 PNG）  
> RTM：[`multi-agent-platform-rtm-v2.md`](docs/prd/multi-agent-platform-rtm-v2.md)（**88 Must + 22 Should**）

### V1 Must（已交付 — 功能骨架，32 REQ）

- Issue 看板（3 列 backlog/running/done）+ Issue 详情时间线
- Squad：右栏 briefing + @mention 委派
- Agent CRUD + runtime 下拉 + MCP 入口
- Skill URL 导入 + 按 Agent 分配
- Multica 式三栏（4 项左栏导航）
- Wiki 浏览器占位（5 页 mock）
- 答辩路径：FRI-11 → 产品小队 → @mention

### V2 Must（当前 — Multica 截图级 Replica，88 UI-* Must REQ）

> 模块清单以 `multica-image/ref1–ref18` **逐张视觉审阅**为准（见 inventory），非口述推断。

- **完整侧栏 IA**：搜索+新建、收件箱/我的 Issue、工作区 6 项、配置 3 项
- **Issue 5 列看板** + 筛选 Tab + 看板/列表切换 + 富卡片（ID/摘要/badge/相对时间）
- **收件箱三栏**（列表 + 详情 + 时间线）
- **新建 Issue 双模态**（智能体/手动）+ 状态/优先级/指派人/标签/项目
- **小队列表页 + 详情页**（成员 Tab / 指令 Tab）
- **智能体详情双栏 + 8 Tab**（动态/Tasks/指令/Skills/环境变量/MCP…）
- **Skills 表格页**（名称/被谁使用/添加者/更新时间 + 搜索筛选）
- **设置二级导航**（个人资料/偏好/工作区/成员 mock）
- **Runtime 页**（机器列表 + 健康度/Agents/费用/CLI 版本表格）
- **Ctrl+K 命令面板** + 顶栏 working 计数
- **Wiki 嵌入 Multica 侧栏 IA**（保留 5 页 mock + 毕设差异化叙事）
- **暗色视觉对齐** `multica-image/` 18 张截图
- **V1 答辩路径回归**（FRI-11 不得破坏）

### Should

- V1：Autopilot / Memory mock 面板 / Workspace 设置
- V2：智能体创建 Issue Tab、命令面板 recent、Skill 行详情、Runtime 行展开、`test_must_paths.py` V2 断言扩展

### Won't（V1/V2 均不变）

- 真实 Pi/Claude Code/Cursor 子进程执行
- PostgreSQL / WebSocket 实装
- 真实 GitHub Skill 拉取 / runtime LookPath 发现
- Wiki ingest 管线 / Memory 向量检索
- 企业 RBAC / 多租户 / 14 CLI daemon
- 答辩实验数据采集

## 风险

| 风险 | 等级 | 对策 |
|------|------|------|
| PRD 范围膨胀到 Phase 4 全量 | 高 | PRD 按 Phase 0–1 写详、Phase 2–4 写概要；原型只 Must |
| 原型做成静态截图 | 中 | 队员 3 必须可点击状态流转 + 面板切换 |
| 与现有 design/ 文档重复 | 低 | PRD 引用 `design/` 为输入，chanpin 为交付真源 |

## Go / No-Go

**Go.** 调研与设计文档已充分（`design/synthesis.md` 530 行 + `references/deep/` 四份深读），缺的是产品化 PRD 与可演示原型 —— 正是本次 Issue 目标。

## V1 → V2 差异摘要

| 维度 | V1 | V2 |
|------|----|----|
| 左栏 | 4 项 | 搜索+新建 + 收件箱 + 工作区 6 项 + 配置 3 项 |
| 看板 | 3 列 | **5 列** + 筛选 + 视图切换 |
| 小队 | 右栏片段 | **列表 + 详情页** |
| 智能体 | 简单 CRUD | **8 Tab 详情** |
| Skills | 导入表单 | **表格页** |
| 全局 | 无 | **Ctrl+K**、Runtime、Settings |

## 下一步

1. ~~队员 1 → research/~~ ✅
2. ~~队员 2 → PRD V1~~ ✅ → **队员 2 → PRD/RTM V2 增量** ✅
3. **队员 3 → prototype/ 高保真 V2 重做**（以 `multica-image/` + RTM 增量为准）
4. 队长 → utility-pm-critic + MVP 签核
