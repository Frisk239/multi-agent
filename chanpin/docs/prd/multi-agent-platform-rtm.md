---
artifact: rtm
version: "1.0"
created: 2026-07-08
status: draft
parent_prd: multi-agent-platform.md
---

# Requirements Traceability Matrix — Multi-Agent 平台 MVP 原型

> REQ 前缀：ISS / SQD / AGT / SKL / NAV / WIK  
> 优先级：Must = MVP 原型必须可演示 · Should = 可选 · Won't = 明确排除  
> AC 摘要：Given/When/Then 浓缩，完整验收见 `docs/handoff/`

---

## 追溯链

```
PRODUCT-BRIEF Must → research/jtbd Hiring Criteria → PRD FR → RTM REQ → US → AC
```

| 来源 | 锚点 |
|------|------|
| Persona 林远 Must 表 | `research/personas.md` §7 |
| JTBD Must-have | `research/jtbd.md` Hiring Criteria |
| Multica 对标 | `research/multica-feature-matrix.md` |

---

## ISS — Issue 看板与时间线

| REQ ID | 需求陈述 | 优先级 | User Story | AC 摘要 | 原型验证 |
|--------|----------|--------|------------|---------|----------|
| ISS-001 | 看板展示 backlog / running / done 三列（可选 in_review 第四列） | Must | US-ISS-01 | **G** 看板页已加载且 seed 含 ≥6 Issue **W** 用户打开 Issues **T** 三列均可见且每列 ≥1 卡片 | 目视 + 列计数 |
| ISS-002 | 拖拽 Issue 卡片跨列切换 status | Must | US-ISS-01 | **G** 卡片在 backlog **W** 拖至 running 列 **T** 卡片出现在 running 且 backlog 减少 1 | 手动拖拽 |
| ISS-003 | Issue 卡片显示 identifier + 标题 + assignee badge | Must | US-ISS-01 | **G** Issue FRI-11 存在 **W** 看板渲染 **T** 卡片含「FRI-11」、标题、assignee 名称/badge | 目视 |
| ISS-004 | 点击卡片打开 Issue 详情（主区或 overlay） | Must | US-ISS-02 | **G** 看板可见 **W** 点击任一卡片 **T** 详情展示标题、描述、状态、assignee | 点击 |
| ISS-005 | Issue 详情页 comment 时间线按时间正序 | Must | US-ISS-02 | **G** Issue 含 ≥2 comment **W** 打开详情 **T** 时间线可见 author 头像/名、正文、时间戳 | 目视 |
| ISS-006 | Assignee 支持 agent 与 squad 多态下拉 | Must | US-ISS-03 | **G** 详情页打开 **W** 切换 assignee 为「产品小队」 **T** assignee 显示 squad 名且右栏出现 briefing 区 | 下拉选择 |
| ISS-007 | Comment 支持 @mention Agent 渲染为 pill | Must | US-ISS-02 | **G** comment 含 `@调研 Agent` **W** 渲染时间线 **T** mention 显示为可识别 pill/链接样式 | 目视 |
| ISS-008 | 预置 6–10 条 mock Issue，覆盖三列 | Must | US-DEMO-01 | **G** 首次加载 **W** 无用户操作 **T** Issue 总数 6–10 且 backlog/running/done 均有分布 | 计数 |
| ISS-009 | Issue identifier 格式 `{PREFIX}-{number}` | Must | US-ISS-01 | **G** seed 数据 **W** 看板渲染 **T** 至少一条为 `FRI-11` 风格 | 目视 |
| ISS-010 | Sub-issue / Stage / metadata KV | Won't | — | — | 不验证 |

---

## SQD — Squad 编排

| REQ ID | 需求陈述 | 优先级 | User Story | AC 摘要 | 原型验证 |
|--------|----------|--------|------------|---------|----------|
| SQD-001 | Squad 实体：名称、leader、roster 成员列表 | Must | US-SQD-01 | **G** Squads 页或右栏 **W** 打开「产品小队」 **T** 可见 leader 高亮 + ≥2 成员 | 目视 |
| SQD-002 | 预置 1 个「产品小队」含队长与专精成员 | Must | US-DEMO-01 | **G** 首次加载 **W** 无操作 **T** 「产品小队」存在，leader=策划队长，成员含调研/PRD/原型 Agent | seed 检查 |
| SQD-003 | Issue 指派 Squad 后右栏展示 briefing 摘要 | Must | US-SQD-01 | **G** Issue assignee=squad **W** 选中该 Issue **T** 右栏含 Operating Protocol + Roster + 指令三段摘要 | 目视 |
| SQD-004 | 队长 comment 含 roster mention 链接格式 | Must | US-SQD-02 | **G** 预置队长 comment **W** 查看时间线 **T** roster 成员以 `[@Name](mention://agent/...)` 或等效 pill 展示 | 目视 |
| SQD-005 | 队长 @mention 成员 comment 显示委派态 | Must | US-SQD-02 | **G** 时间线含队长 @调研 Agent comment **W** 查看 **T** 可见委派语义（pill + 可选「已委派」态） | 目视 |
| SQD-006 | 答辩高光路径 Issue→Squad→briefing→@mention 可 3 分钟内完成 | Must | US-DEMO-01 | **G** demo seed **W** 按 demo script 操作 **T** 全程无 dead-end，路径完整 | 计时 demo |
| SQD-007 | Deferred escalation / 人类 squad 成员 | Won't | — | — | 不验证 |

---

## AGT — Agent 定义

| REQ ID | 需求陈述 | 优先级 | User Story | AC 摘要 | 原型验证 |
|--------|----------|--------|------------|---------|----------|
| AGT-001 | Agent 列表页展示所有 Agent | Must | US-AGT-01 | **G** Agents 导航 **W** 点击 **T** 列表 ≥3 Agent 含名称与 runtime | 点击 |
| AGT-002 | 创建/编辑 Agent：名称 + system instructions | Must | US-AGT-01 | **G** 创建向导 **W** 填名称与指令并保存 **T** 列表出现新 Agent（mock 内存态即可） | 表单提交 |
| AGT-003 | Runtime 下拉 mock：Pi / Claude Code / opencode / Cursor | Must | US-AGT-01 | **G** Agent 编辑页 **W** 打开 runtime 下拉 **T** 四项均可选，含 Cursor（UI only） | 下拉 |
| AGT-004 | MCP 配置入口：servers 列表 + 添加按钮 | Must | US-AGT-01 | **G** Agent 详情 **W** 查看 MCP 区 **T** 可见空列表与添加入口（不要求保存真实 JSON） | 目视 |
| AGT-005 | Agent 状态 badge（idle/working） | Should | US-AGT-01 | **G** Agent 列表 **W** 渲染 **T** 至少 1 Agent 显示状态 badge | 目视 |
| AGT-006 | max_concurrent_tasks / visibility 字段 | Won't | — | — | 不验证 |
| AGT-007 | 真实 runtime 发现（LookPath） | Won't | — | — | 不验证 |

---

## SKL — Skill 导入与分配

| REQ ID | 需求陈述 | 优先级 | User Story | AC 摘要 | 原型验证 |
|--------|----------|--------|------------|---------|----------|
| SKL-001 | Skill URL 输入 + 导入按钮 | Must | US-SKL-01 | **G** Skills 页 **W** 输入 GitHub URL 并点导入 **T** 列表新增 1 条 skill | 表单 |
| SKL-002 | Skill 列表展示名称与来源 URL | Must | US-SKL-01 | **G** seed 含 skills **W** 打开 Skills **T** 每条可见名称 + URL | 目视 |
| SKL-003 | Agent 详情页 skill 多选分配 | Must | US-SKL-01 | **G** Agent 编辑页 **W** 勾选 ≥1 skill 并保存 **T** Agent 详情显示已分配 skills | checkbox |
| SKL-004 | SKILL.md 编辑器 | Should | — | — | 不 Must |
| SKL-005 | 本地目录 scan / 执行时注入 | Won't | — | — | 不验证 |

---

## NAV — 布局与导航

| REQ ID | 需求陈述 | 优先级 | User Story | AC 摘要 | 原型验证 |
|--------|----------|--------|------------|---------|----------|
| NAV-001 | 三栏布局：左导航 ~240px + 主区 + 右栏 ~320px | Must | US-NAV-01 | **G** 任意页 **W** 页面加载 **T** 三栏同屏可见，主区占剩余宽度 | 目视 / 1280px |
| NAV-002 | 左栏导航：Issues / Agents / Skills / Wiki | Must | US-NAV-01 | **G** 应用加载 **W** 依次点击四项 **T** 主区切换对应视图无整页刷新 | 点击 |
| NAV-003 | 右栏随选中 Issue/Agent 切换上下文 | Must | US-NAV-01 | **G** 看板页 **W** 选中不同 Issue **T** 右栏属性区内容随之变化 | 点击 |
| NAV-004 | 默认暗色主题 | Must | US-NAV-01 | **G** 首次加载 **W** 无主题切换 **T** 背景为深色、文字浅色（对比度可读） | 目视 |
| NAV-005 | 顶栏 Workspace 切换 | Should | — | 单 workspace 可省略 | — |
| NAV-006 | Inbox / 通知 | Won't | — | — | 不验证 |

---

## WIK — Wiki 浏览器（本毕设增量）

| REQ ID | 需求陈述 | 优先级 | User Story | AC 摘要 | 原型验证 |
|--------|----------|--------|------------|---------|----------|
| WIK-001 | Wiki 左树形导航 | Must | US-WIK-01 | **G** Wiki 页 **W** 加载 **T** 左侧树含 ≥5 节点 | 目视 |
| WIK-002 | 点击树节点主区渲染 mock 页面 | Must | US-WIK-01 | **G** Wiki 树可见 **W** 点击 Architecture **T** 主区显示 architecture 摘要内容 | 点击 |
| WIK-003 | 5 页预置：Home / Architecture / Synthesis / Sprint Log / Glossary | Must | US-WIK-01 | **G** seed **W** 逐一点击 5 节点 **T** 均有非空内容 | 遍历 |
| WIK-004 | 目录结构对齐 llm-wiki-pattern 顶层 | Must | US-WIK-01 | **G** PRD 附录 **W** 对照 **T** 5 页路径与 PRD Q2 决策一致 | 文档对照 |
| WIK-005 | Ingest 管线 / Issue 完成触发 | Won't | — | — | 不验证 |
| WIK-006 | AGENTS.md 预览 | Should | — | Workspace 设置可选 | — |

---

## Should 级汇总（原型可选，无 Must AC）

| REQ ID | 域 | 摘要 |
|--------|-----|------|
| SHL-001 | Autopilot | Cron 配置表单 UI，不对接 scheduler |
| SHL-002 | Memory | 检索面板 mock，无向量库 |
| SHL-003 | Workspace | repo 路径 + AGENTS.md 预览 |

---

## Won't 级汇总（禁止写入 Must AC）

| 类别 | 条目 |
|------|------|
| 执行 | 真实 CLI spawn、daemon、task 状态机、WS progress |
| 基础设施 | PostgreSQL、Redis、多节点 |
| Multica 完整 | 14 CLI、Sub-issue/Stage、metadata KV、Inbox |
| 知识实装 | Wiki ingest、Issue 事件联动、Memory 向量检索 |
| 企业 | RBAC、多租户、云端 runtime |

---

## 覆盖率检查

| 检查项 | 状态 |
|--------|------|
| PRODUCT-BRIEF Must 6 项均有 ≥1 REQ | ✅ |
| 每条 Must REQ 有 AC 摘要 | ✅ |
| 每条 Must REQ 有 User Story | ✅ |
| Won't 未渗入 Must AC | ✅ |
| Open Questions 已拍板并映射 REQ | ✅ NAV-004, WIK-003, AGT-003 |
| 答辩 demo 路径有 SQD-006 | ✅ |
| 预置数据有 ISS-008 + SQD-002 | ✅ |

---

## V2 增量（Multica UI Replica）

> **V1 本文档仍有效**（功能骨架 + 答辩路径）。V2 新增 **88 条 UI-* Must REQ**（+ 22 Should），基于 `multica-image/ref1–ref18` 逐张清点。  
> 完整增量表：[`multi-agent-platform-rtm-v2.md`](./multi-agent-platform-rtm-v2.md)  
> 截图清点：[`multica-ui-replica-inventory.md`](./multica-ui-replica-inventory.md)

| 域 | V2 Must | V2 Should |
|----|---------|-----------|
| UI-NAV | 11 | 2 |
| UI-CMD | 5 | 0 |
| UI-ISS | 24 | 8 |
| UI-SQD | 13 | 2 |
| UI-AGT | 15 | 5 |
| UI-SKL | 5 | 1 |
| UI-SET | 5 | 3 |
| UI-RT | 6 | 1 |
| UI-WIK | 4 | 0 |
| **合计** | **88** | **22** |

**V2 验收**：V1 32 条 + V2 UI Must 88 条；FRI-11 答辩路径不得回退。

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-08 | 产品·需求与PRD官 | 初版 — 32 Must REQ + AC 摘要 |
| 1.1 | 2026-07-08 | 产品·需求与PRD官 | 追加 V2 增量索引 |
| 1.2 | 2026-07-08 | 产品·需求与PRD官 | V2 88 Must — 基于 18 张截图 inventory |
