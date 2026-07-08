# Multica 功能对标表 — MVP Must 对齐

> 2026-07-08 · 输入：`references/deep/multica.md` + PRODUCT-BRIEF Must  
> 用途：PRD REQ 映射 · 原型交互对照 · 答辩差异化说明

---

## 图例

| 标记 | 含义 |
|------|------|
| **M** | PRODUCT-BRIEF Must — 原型必须可演示 |
| **S** | Should — 原型可选/表单级 |
| **W** | Won't — 本次不做 |
| **Full** | Multica 已完整实现 |
| **Partial** | Multica 有部分能力 |
| **N/A** | Multica 不涉及 |

---

## 1. 总览对标

| 模块 | Multica 能力摘要 | 本毕设 MVP | 差异 / 备注 |
|------|-----------------|------------|-------------|
| Issue 看板 | Workspace 看板 + 状态列 + 拖拽 | **M** mock | 状态简化为 backlog/running/done |
| Issue 详情 | 标题、描述、assignee、comment 时间线 | **M** mock | 时间线为核心 demo 面 |
| Squad | leader_id + roster + briefing 注入 | **M** mock | 学 `squad_briefing.go` 三段结构 |
| @mention 委派 | comment 解析 mention → 排任务 | **M** mock UI | 不需真 enqueue |
| Agent CRUD | 名称、指令、runtime、visibility、并发 | **M** mock | 含 MCP 配置入口 |
| Skill | 创建/URL 导入/按 Agent 分配 | **M** mock | GitHub URL 导入 UI |
| 三栏布局 | 侧栏 + 主区 + 上下文面板 | **M** | 视觉对齐 Multica |
| Wiki | — | **M** mock 浏览器 | **本毕设增量** |
| 任务执行 | daemon spawn 14 CLI | **W** | 原型不 spawn |
| WebSocket 进度 | task:* 事件流 | **W** | 可用前端 mock 动画代替 |
| Autopilot | Cron/Webhook 调度 | **S** 表单 UI | 不对接 scheduler |
| Memory | — | **S** mock 面板 | Phase 2+ 实装 |
| 多节点/Redis | Broadcaster relay | **W** | 纯本地单进程 |
| 云端 Runtime | cloud runtime 模式 | **W** | 仅 local 叙事 |

---

## 2. Issue 看板与时间线

| 功能点 | Multica 实现 | 源码/文档索引 | MVP | 原型建议 |
|--------|-------------|--------------|-----|----------|
| Issue CRUD | `issue` 表 + API | `001_init.up.sql` | **M** | mock 数据 6–10 条 |
| 状态列 | backlog/ready/running/done 等 | issue status enum | **M** | 简化为 3–4 列 |
| Assignee 多态 | `(assignee_type, assignee_id)` member/agent/squad | `001_init`, `084_squad` | **M** | 下拉选 Agent/Squad |
| Comment 时间线 | `comment` 表 author 多态 | comment handler | **M** | 含 agent/human 混合 |
| @mention 触发 | `computeCommentAgentTriggers` | `comment.go:1465` | **M** | 展示 @agent pill |
| Issue 编号 | identifier + number | issue 模型 | **M** | 如 FRI-11 风格 |
| Sub-issue / Stage | parent_issue + stage | multica issue children | **W** | Phase 1+ |
| Metadata KV | issue metadata | multica feature | **W** | 可选展示 |

---

## 3. Squad 编排

| 功能点 | Multica 实现 | 源码/文档索引 | MVP | 原型建议 |
|--------|-------------|--------------|-----|----------|
| Squad 实体 | `squad` + `squad_member` | `084_squad.up.sql` | **M** | 1 个预置「产品小队」 |
| Leader | `leader_id REFERENCES agent` | squad 表 | **M** | 队长角色高亮 |
| 指派 Squad | assignee_type=squad → leader 队列 | `issue_trigger.go:136-163` | **M** | Issue 指派 Squad demo |
| Leader briefing | 注入 Operating Protocol + Roster + 自定义指令 | `squad_briefing.go:112` | **M** | 右侧面板展示 briefing 摘要 |
| Roster mention 链接 | `[@Name](mention://agent/<UUID>)` | briefing 渲染 | **M** | 可点击 @ 成员（mock） |
| Deferred escalation | `deferred` 任务 + fire_at | `task.go:799` | **W** | PRD 概要提及即可 |
| 人类成员 | squad_member member_type=member | squad_member | **W** | MVP 仅 agent 成员 |

**Squad demo 脚本（建议）：**

1. Issue 指派「产品小队」  
2. 时间线出现队长 agent comment（含 roster）  
3. 队长 comment @调研 Agent → UI 显示委派态  

---

## 4. Agent 定义与 Runtime

| 功能点 | Multica 实现 | 源码/文档索引 | MVP | 原型建议 |
|--------|-------------|--------------|-----|----------|
| Agent 创建 | 名称 + runtime 选择 | agents-create doc | **M** | 向导 2 步 |
| System instructions | agent instructions 字段 | agent 配置 | **M** | 多行文本 |
| Runtime 绑定 | local daemon × CLI | `daemon/config.go` | **M** | 下拉 Pi/Claude/opencode（mock） |
| Runtime 发现 | LookPath + 登录 shell fallback | `config.go:141,832` | **W** | 静态列表即可 |
| Agent 状态 | idle/working/blocked/error/offline | agent 表 | **S** | badge 展示 |
| max_concurrent_tasks | 并发上限 | agent 配置 | **S** | 数字输入 |
| visibility | workspace/private | agent 表 | **W** | 单用户无需 |
| MCP 配置 | per-agent MCP servers | multica docs | **M** | 配置入口 + 空列表 |
| Agent @mention | workspace 内 @agent | agents doc | **M** | 与 comment 联动 |

---

## 5. Skill 导入与分配

| 功能点 | Multica 实现 | 源码/文档索引 | MVP | 原型建议 |
|--------|-------------|--------------|-----|----------|
| Skill 创建 | SKILL.md + 支持文件 | Skills doc | **S** | 可不实现编辑器 |
| URL 导入 | GitHub / ClawHub | agents-create doc | **M** | URL 输入 → 列表新增 |
| 按 Agent 分配 | attach skills to agent | Skills doc | **M** | Agent 详情 skill 多选 |
| Skill 扫描本地目录 | scan from disk | multica | **W** | — |
| 执行时注入 | daemon 交付给 CLI | runtime 管线 | **W** | 叙事即可 |

---

## 6. 布局与导航（Multica 式三栏）

| 功能点 | Multica 实现 | MVP | 原型建议 |
|--------|-------------|-----|----------|
| 左栏导航 | Workspace、Issues、Agents、Skills、Wiki… | **M** | 图标 + 标签 |
| 主工作区 | 看板 / 列表 / 详情 | **M** | 看板默认 |
| 右栏上下文 | Issue 属性、Agent 详情、Activity | **M** | 随选中项切换 |
| 顶栏 | Workspace 切换、搜索 | **S** | 单 workspace 可省略切换 |
| Inbox / 通知 | inbox_item 多态 | **W** | Agent 不收通知（multica 设计） |
| 暗色主题 | Multica UI | **S** | 待 Open Question |

---

## 7. Wiki 浏览器（本毕设增量 — Multica 无）

| 功能点 | Multica | 本毕设 MVP | 参考 |
|--------|---------|------------|------|
| Wiki 导航树 | N/A | **M** mock | `concepts/llm-wiki-pattern.md` |
| Wiki 页面阅读 | N/A | **M** mock | mock architecture/synthesis 摘要 |
| Ingest 管线 | N/A | **W** | Phase 2 |
| Issue 完成触发 ingest | N/A | **W** | PRD 写概要 |
| AGENTS.md 预览 | N/A | **S** | Workspace 设置 |

---

## 8. 执行层与基础设施（Multica 有 · MVP Won't）

| 功能点 | Multica | MVP | 说明 |
|--------|---------|-----|------|
| 任务队列状态机 | queued→dispatched→running→… | **W** | `agent.sql` Claim/Start/Complete |
| DB 行即锁 | 条件 UPDATE | **W** | Phase 0 `app/` |
| Daemon 进程 | multica daemon | **W** | |
| Backend 抽象 14 CLI | `pkg/agent/agent.go` | **W** | Agent 表单仅选名字 |
| WS task:progress | EventBus→Broadcaster | **W** | 前端 fake progress bar 可选 |
| Autopilot Cron | scheduler + autopilot | **S** UI | |
| Webhook 触发 | autopilot_webhook | **W** | |

---

## 9. PRD REQ 映射建议（供队员 2）

| REQ 域 | 建议 ID 前缀 | Must 条目数 | Multica 对标节 |
|--------|-------------|------------|----------------|
| ISS | ISS-001… | 看板+时间线+assignee | §2 |
| SQD | SQD-001… | Squad+@mention | §3 |
| AGT | AGT-001… | Agent CRUD+MCP | §4 |
| SKL | SKL-001… | URL 导入+分配 | §5 |
| NAV | NAV-001… | 三栏布局 | §6 |
| WIK | WIK-001… | 浏览器占位 | §7 |

---

## 10. 答辩用「差异化一句话」

> **Multica** 把 14 种 CLI 变成可指派队友，但不管项目 Wiki 与跨会话记忆；**本毕设**在 PRD/原型层证明：用 Issue 生命周期驱动编排 UI，并为「编译式 Wiki + 可插拔 Memory」预留同一控制台入口 —— MVP 以 mock 演示编排 Must 路径，执行与 ingest 在 Phase 0–2 实装。

**Confidence：High** — 与 `design/architecture.md` §5 Related Work 一致

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-08 | 初版 — 对齐 PRODUCT-BRIEF Must，基于 multica 深读 |
