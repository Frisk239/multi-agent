# Multica 对照差距表 · 真站体验 + 源码（2026-07-19）

> **真站：** [multica.ai / frisk239-s-coding-workspace](https://multica.ai/frisk239-s-coding-workspace/issues)（Playwright headed 登录后巡览）  
> **源码：** `references/deep/multica.md` + `references/repos/multica/`  
> **本仓：** `localhost:3000` 本地控制台（魔改本地版）  
> **目标边界：** 复刻 **本地控制台体验**，**不**做 daemon/云协议 1:1、不抄云托管。

现场巡览笔记：`app/.progress/multica-live-tour/*.json`

---

## 0. 信息架构对照（侧栏）

| Multica 真站 | 本仓 | 差距 |
|---|---|---|
| 收件箱（三栏：列表+详情+Helper） | Inbox 列表 + 筛选 | 本仓无右侧 **Multica Helper** 常驻对话；无「已归档」折叠区同款 |
| **聊天** | ❌ 无独立 Chat 路由 | **P0 体验缺口**：人↔Agent 私信/会话台 |
| 我的 issue | 有（筛选/指派） | 真站 Tab：全部/已分配/我创建的/**我的智能体和小队** |
| Issues 看板 | Issues 看板 | 真站列：**待规划/待办/进行中/审核中/已完成**；本仓 **Backlog/Todo/In Progress/In Review/Done/Blocked**（更细，但文案未本地化成 Multica 中文列） |
| **项目** | ❌ 无 | **P1**：跨 issue 项目容器（真站可空态「还没有项目」） |
| 自动化 | 有（规则列表） | 真站空态是 **模板画廊**（日报/PR review/Bug 分诊…）+「从空白开始」 |
| 智能体 | 有 | 真站 **15** 个 agent 列表：我的/全部/已归档；本仓 seed 4 个为主 |
| 小队 | 有 | 近似；真站强调队长列 |
| **用量** | ❌ 无 | **P1**：Token/费用/运行时长/任务数图表与排行榜 |
| 运行时 | 有 | 真站 = **电脑/daemon 机器**（「添加电脑」、daemon id、在线离线）；本仓 = **CLI 探测**（claude/opencode/cursor） |
| Skills | 有 | 真站 **127** skills + usedBy 列；本仓扫描本地 skills |
| 设置 | 有 | 真站分 **我的账号**（资料/偏好/快捷键/通知/**API Token**）+ **工作区**（通用/**代码仓库**/GitHub/**集成**/实验室/成员/标签/属性）；本仓偏 **环境诊断 + cwd + 健康** |
| Wiki / Memory / 运行 | 本仓有、真站侧栏未见同级入口 | 本仓 **超车点**（编译式 Wiki + Memory 运维） |
| 快速派活 Q | 本仓有 | 真站未见同级「无 Issue 先跑」入口（偏 issue 驱动） |
| CmdK Ctrl+K | 双方有 | 真站建议问题绑定 Helper |

---

## 1. Issue / 看板（真站 Issues）

### 真站观察到的能力
- 顶栏筛选：全部 / **成员** / **智能体**；「0 个智能体工作中」状态条
- 视图：**筛选 · 手动 · 看板**
- 卡片：identifier（FRI-10）+ 长 User request 摘要 + **负责人小队** + 相对更新时间
- 列语义偏产品流程（待规划→…→已完成）

### Issue 详情（FRI-10 点开）
- 标题 + User request 正文
- **添加子 issue**
- **动态**时间线（agent 评论 + 人回复 + @mention 委派）
- **取消订阅** / 订阅
- 失败条 + **重试 task**
- 右侧 **属性**：状态、负责人（小队）、项目、添加字段、**Pull Request** 关联
- **执行日志** + **显示历史运行（19）**
- **Token 用量**（输入/输出/缓存读写下、运行次数）
- 底部回复框

### 本仓
- 看板筛选更深（优先级/来源/失败/标签/指派 readiness）
- Issue 详情：评论时间线、run trace 锚点、再执行、部分运维链
- **缺：** 子 issue、订阅、PR 关联、字段自定义、详情内 Token 用量面板、与真站同构的「执行日志折叠历史」密度

### 差距优先级
| ID | 缺口 | 优先级 | 建议切片 |
|---|---|---|---|
| G1 | Issue **子 issue**（树/父级） | P1 → ✅ 一层 | `issue-subtasks`（2026-07-19；无多层/无 project 继承） |
| G2 | Issue **订阅**（关注/取消） | P2 | `issue-subscribe` |
| G3 | 详情 **PR 关联**（分支/标题引用） | P2 | `issue-pr-link`（本地可只做 URL/编号字段） |
| G4 | 详情 **Token/用量** 摘要 | P1 → ✅ 次数/耗时 | `issue-run-usage`（2026-07-19；token 本地 null） |
| G5 | 看板列文案/顺序可选 Multica 中文产品列 | P3 | `board-column-i18n` |
| G6 | 「N 个智能体工作中」全局状态条 | P2 | `agents-working-banner` |

---

## 2. Inbox（真站默认着陆）

### 真站
- **三栏：** 通知列表 | 详情正文（markdown 长帖）| **Multica Helper** 侧栏
- 列表项含 agent 完成摘要、失败摘要、相对时间
- **已归档 N** 折叠区
- 空详情：「选择一条通知查看详情」

### 本仓
- 列表 + kind 筛选 + bulk 已读/归档 API + 失败深链
- **缺：** 真三栏详情阅读器；Helper；归档折叠 UX 对齐

| ID | 缺口 | 优先级 | 建议切片 |
|---|---|---|---|
| G7 | Inbox **三栏详情**（列表+正文，不必先上 Helper） | P0 → ✅ 双栏 | `inbox-tri-pane`（2026-07-19；Helper 仍缺） |
| G8 | Inbox **归档区**折叠与真站交互对齐 | P2 | `inbox-archive-section` |

---

## 3. 聊天 / Multica Helper（真站强特征）

### 真站
- 独立 **聊天** 路由：会话列表 + 对话区
- 全局右侧 **Multica Helper**（离线态仍展示；建议问题 chips；发消息排队）
- Issue/任意页可「问 Multica」「新对话」
- Agent 详情有 **私信**、**分配工作**

### 本仓
- ❌ 无 Chat 实体、无 Helper agent 产品位
- 有 CmdK / 快速派活 / Issue 评论 @mention

| ID | 缺口 | 优先级 | 建议切片 |
|---|---|---|---|
| G9 | **Chat 会话**（人↔指定 agent，持久消息） | P0 → ✅ MVP | `agent-chat`（2026-07-19；Helper/流式仍弱） |
| G10 | **Helper 侧栏**（可先绑固定 agent + 离线队列提示） | P1 → ✅ FAB+浮窗 | `helper-rail`（2026-07-19；复用 chat API） |
| G11 | Agent **私信入口**与 Chat 打通 | P1 → ✅ | `agent-work-dashboard` 侧栏私信（2026-07-19） |

**源码提示：** Multica chat 与 task 队列分离；Helper 是特殊 agent。本仓可用现有 run/quick_create 做「发一条即 enqueue」MVP，消息落 comment 或独立 chat_message 表。

---

## 4. 智能体 / 小队 / 运行时

### 真站 Agent 详情（产品·策划队长）
- 状态：离线 · 空闲 · 分类 · 模型 auto · 绑定 **Cursor (Frisk239)** runtime
- Tab：**概览 / 工作 / 能力 / 设置**
- 当前工作 + **最近工作**列表（成功/取消/时长/关联 issue）
- Skills 列表、近 30 天 **成功率/平均耗时/失败数**
- 操作：私信、分配工作

### 真站 Runtimes
- 机器列表：**添加电脑**、daemon id、在线/离线  
- 语义是 **daemon 宿主**，不是「本机 CLI 探测」

### 本仓
- Agent readiness（cwd/runtime/并发）、列表筛选、runs 深链
- Runtimes = CLI detect（claude/opencode/cursor）
- **缺：** 工作/能力/设置多 Tab 仪表盘；30 天成功率；daemon 机器模型（本地可弱化）

| ID | 缺口 | 优先级 | 建议切片 |
|---|---|---|---|
| G12 | Agent 详情 **工作历史 + 成功率仪表** | P1 → ✅ | `agent-work-dashboard`（2026-07-19） |
| G13 | Agent **能力/设置** Tab 与 Skills 绑定可视化 | P2 | `agent-capability-tabs` |
| G14 | Runtime 文案分层：本机 CLI vs（可选）远程机器 | P3 | docs + UI 命名，避免用户误解 |

---

## 5. 自动化 / 项目 / 用量

### 真站自动化
- 空态 **模板画廊**（新闻摘要、PR review、Bug 分诊、周报、依赖审计、文档检查）+ 从空白开始  
- 本仓：规则 CRUD + 调度 + 失败筛选；**缺模板冷启动体验**

### 真站项目
- 一级导航；空态创建项目  
- 本仓无 project 实体

### 真站用量
- 费用/Token/运行时长/任务数；1d–90d；图表；排行榜  
- 本仓仅 issue 级 token 字段与健康卡局部数据，**无用量中心**

| ID | 缺口 | 优先级 | 建议切片 |
|---|---|---|---|
| G15 | Automation **模板画廊**冷启动 | P1 → ✅ | `automation-templates`（2026-07-19；6 预设+预填，无 webhook） |
| G16 | **Project** 容器（issue 归属） | P2 | `projects-mvp` |
| G17 | **用量中心**（聚合 run token/时长） | P1 → ✅ 次数/时长 | `usage-dashboard`（2026-07-19；token/费用 null） |

---

## 6. Settings

### 真站
- 账号：资料、偏好、快捷键、Issue/聊天/通知、**API Token**  
- 工作区：通用、**代码仓库**、GitHub、集成、实验室、成员、标签、属性  

### 本仓
- 环境诊断、cwd 持久化、Wiki/Run/Memory/Auto 健康、收尸  
- **本仓超车：** 运维健康密度高于真站设置  
- **缺：** 个人资料「关于你→注入 agent」、API Token、仓库绑定、成员协作设置  

| ID | 缺口 | 优先级 | 建议切片 |
|---|---|---|---|
| G18 | 用户 **About/偏好** 注入 agent prompt | P2 | `user-profile-brief` |
| G19 | 本地 **API Token**（给 CLI `ma` 用，可选） | P3 | `local-api-token` |
| G20 | 工作区「代码仓库」路径展示（可与 cwd 合并叙事） | P2 | settings 文案整合 |

---

## 7. 本仓相对 Multica 的「超车 / 应保留」

不要为对齐真站而删掉这些本地优势：

| 能力 | 说明 |
|---|---|
| **Wiki 编译 + query + dead 批量重试** | 真站侧栏无同级 Wiki 产品位 |
| **Memory 列表/搜索/批量删除** | 真站无独立记忆台 |
| **Settings 健康卡 / cwd 持久化** | 本地运维更强 |
| **快速派活** | 无 issue 先跑，适合本机 CLI |
| **Runs 全局表 + 批量取消 + 收尸** | 真站更多嵌在 issue 执行日志 |
| **失败/ready 运营深链网** | 本地已很密 |

---

## 8. 源码层提示（体验切片时对齐实现）

摘自 `references/deep/multica.md`，供实现时对照，**非**本阶段必须 1:1：

1. **DB 行即锁**状态机 + claim 排除同 agent 同 scope 并发  
2. **Squad = leader task + briefing + mention**（本仓已钉）  
3. **FailStale + heartbeat**（本仓有 stale sweeper / run health）  
4. **Daemon + waiting_local_directory** → 本仓刻意用 cwd 持久化代替  
5. **Autopilot 模板 + webhook** → 模板可做；webhook 宪法不做  
6. **Runtime 注册机器** → 本地保留 CLI 探测即可  

---

## 9. 建议迭代队列（厚切片顺序）

按 **用户每天感知 × 与真站落差** 排序（可一轮一轮开）：

| 序 | 切片 | 用户路径 | 层 |
|---|---|---|---|
| 1 | **`inbox-tri-pane`** | Inbox 点通知 → 右侧读全文/操作 | web 为主 + 现有 API |
| 2 | **`agent-chat`** | 侧栏聊天/私信 → 与 agent 对话并落 run | shared+server+web |
| 3 | **`helper-rail`** | 任意页右侧助手（可复用 chat） | web+固定 agent |
| 4 | **`issue-run-usage`** | Issue 详情看本次/历史 token 与运行 | server 聚合+web |
| 5 | **`agent-work-dashboard`** | Agent 详情最近工作与成功率 | server+web |
| 6 | **`automation-templates`** | 自动化空态从模板一键建规则 | web+seed 模板 |
| 7 | **`usage-dashboard`** | 用量页图表 | server 聚合+web |
| 8 | **`issue-subtasks`** | 父 issue 下挂子 issue | schema+API+web |
| 9 | **`projects-mvp`** | 项目容器 | schema+API+web |
| 10 | 其余 G2/G3/G5/G6… | 按需 | — |

**刻意不做（仍有效）：** 云 webhook、多租户、密钥入库 UI、daemon 协议 1:1、waiting_local_directory 全状态机。

---

## 10. 达标重估

| 维度 | 判断 |
|---|---|
| 本地主航道日用（派活/看板/run/wiki/memory/settings） | **仍成立** |
| 与 **真站 Multica 产品壳** 的体验对齐 | **未完成** — 最大洞在 **Chat/Helper、Inbox 三栏、用量、项目、Issue 详情作业面** |
| 下一阶段目标建议 | 以本表 G7→G17 为路线，**一切片一路径**，继续 Playwright 关刀 |

---

## 11. 巡览证据清单

| 页面 | 关键观察 |
|---|---|
| /inbox | 三栏 + 长文详情 + Helper 离线 + 已归档 |
| /issues | 中文列名看板 + 成员/智能体筛选 + FRI 卡片 |
| /issues/:id | 子 issue、订阅、重试 task、PR、执行日志、Token 用量、@mention 动态 |
| /agents · 详情 | 概览/工作/能力/设置；最近运行；成功率 |
| /squads | 队长列；3 小队 |
| /autopilots | 模板画廊空态 |
| /runtimes | 电脑/daemon，非 CLI 列表 |
| /skills | 127 + usedBy |
| /settings | 账号+工作区双区设置 |
| /projects | 空项目 |
| /usage | Token/费用/时长/任务 + 排行 |
| /chat | 独立会话列表 |
| 本仓 / | 运营筛选极密；Wiki/Memory/Runs 入口为本仓特色 |
