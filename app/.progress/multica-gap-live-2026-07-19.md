# Multica 对照差距表 · 真站体验 + 源码（滚动）

> **真站：** [multica.ai / frisk239-s-coding-workspace](https://multica.ai/frisk239-s-coding-workspace/issues)（Playwright headed 登录后巡览）  
> **源码：** `references/deep/multica.md` + `references/repos/multica/`  
> **本仓：** `localhost:3000` 本地控制台（魔改本地版）  
> **目标边界：** 复刻 **本地控制台体验**，**不**做 daemon/云协议 1:1、不抄云托管。  
> **修订：** 2026-07-19 初版 · **2026-07-21 再巡览**（Inbox/模型绑定/运行事件流纳入下一刀队列）

现场巡览笔记：`app/.progress/multica-live-tour/*.json` · 鉴权 `app/.progress/multica-auth/`（gitignore）

---

## 0. 信息架构对照（侧栏）· 2026-07-21 晚

> 全量巡览与落地见 [`ui-multica-parity-tour-2026-07-21.md`](./ui-multica-parity-tour-2026-07-21.md)

| Multica 真站 | 本仓（现状） | 差距 |
|---|---|---|
| 收件箱 · 聊天 · 我的 issue 置顶 | ✅ 同序（个人段无小标题） | 我的 issue 非独立页（G24） |
| 收件箱详情 = IssueDetail | ✅ 动态优先 + 紧凑属性 | Helper 第三栏 / 属性右栏（G27/G26） |
| 聊天双栏 | ✅ Multica 式重做 | 流式弱 |
| Issues 顶栏疏 | ✅ 主筛选 +「更多」 | 列表/手动视图无 |
| 项目 / 自动化 / 智能体 / 小队 / 用量 | ✅ | 表列密度、归档 Tab 等 |
| 运行时=电脑 | 本机 CLI | **刻意** |
| Wiki / Memory / 运行 | 本地运维段 | **超车保留** |
| model 绑定 | ✅ + CLI 发现 | thinking level 无 |

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
| G2 | Issue **订阅**（关注/取消） | P2 → ✅ | `issue-subscribe`（2026-07-19） |
| G3 | 详情 **PR 关联**（分支/标题引用） | P2 → ✅ URL | `issue-pr-link`（2026-07-19；无 GitHub 集成） |
| G4 | 详情 **Token/用量** 摘要 | P1 → ✅ 次数/耗时 | `issue-run-usage`（2026-07-19；token 本地 null） |
| G5 | 看板列文案/顺序可选 Multica 中文产品列 | P3 → ✅ 文案 | `board-column-i18n`（2026-07-19；顺序仍本仓 6 列） |
| G6 | 「N 个智能体工作中」全局状态条 | P2 → ✅ | `agents-working-banner`（2026-07-19；看板顶栏） |

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
| G8 | Inbox **归档区**折叠与真站交互对齐 | P2 → ✅ | `inbox-archive-section`（2026-07-19） |

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
| G13 | Agent **能力/设置** Tab 与 Skills 绑定可视化 | P2 → ✅ | `agent-capability-tabs`（2026-07-19；能力=Skills+MCP） |
| G14 | Runtime 文案分层：本机 CLI vs（可选）远程机器 | P3 → ✅ 文案 | `runtime-cli-naming`（2026-07-19） |

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
| G16 | **Project** 容器（issue 归属） | P2 → ✅ | `projects-mvp`（2026-07-19；无 resource/lead） |
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
| G18 | 用户 **About/偏好** 注入 agent prompt | P2 → ✅ | `user-profile-brief`（2026-07-19） |
| G19 | 本地 **API Token**（给 CLI `ma` 用，可选） | P3 | `local-api-token` |
| G20 | 工作区「代码仓库」路径展示（可与 cwd 合并叙事） | P2 | settings 文案整合 |

---

## 6b. 2026-07-21 新缺口（人点名 · 下一厚切片池）

> 对照：真站 Inbox 巡览 + 源码 `migrations/050_agent_model.up.sql` + `pkg/agent/opencode.go`（`--model`）+ `TaskMessagePayload` 事件流 + 用户截图（运行 trace 弹层 / agent 模型）

| ID | 缺口 | 真站 / 源码依据 | 本仓现状 | 优先级 | 建议切片 |
|---|---|---|---|---|---|
| **G21** | **收件箱事件中心 + 与智能体交互** | 真站：侧栏「收件箱」；右 = 完整 Issue（动态/评论/属性/执行日志）；Helper 同屏 | ✅ **parity-1**（2026-07-21）：文案收件箱；IssueDetail 动态优先+执行日志折叠；去通知摘要条；停用验收巡检；**Helper 第三栏 / 内嵌属性右栏仍缺** | **P0 → 大半完成** | `inbox-multica-parity-impl-1.md` |
| **G22** | **Agent 绑定 runtime 内的 model** | 真站 agent 属性：运行时 + **模型**（如 `opencode/big-pickle`）；源码 `agent.model TEXT`（050）；opencode `--model` | ✅ **impl-1 + discovery**（2026-07-21）：`agent.model` + spawn + **`GET /api/runtimes/:id/models`**（`opencode models`）+ 下拉 | **P0 → ✅** | `agent-model-binding-impl-1.md` · `runtime-model-discovery-impl-1.md` |
| **G23** | **运行中/已完成执行事件流（工具调用时间线）** | 真站 run 弹层：bash/skill/Agent 色块时间线、工具次数、复制/外链；协议 `TaskMessagePayload` type=text/tool_use/tool_result | ✅ **impl-1**（2026-07-21）：`RunEventTimeline` 色条 + 抽屉；Issue/Runs 入口；opencode 无消息时诚实空态 | **P0/P1 → 大半** | `multica-detail-rails-impl-1.md`（流解析仍可加固） |

### 实现提示（本地适配，非 daemon 1:1）

1. **G22 model**  
   - DB：`agent.model text null`（空=跟随 CLI 默认，对齐 Multica「Changing the model only applies to new tasks」）  
   - spawn：`OpencodeBackend` 在 `run` argv 插入 `--model <id>`（对照 `references/repos/multica/server/pkg/agent/opencode.go:82-83`）  
   - UI：Agent 详情「运行时」下增加「模型」输入/下拉；首版可手填 `opencode/…`，二期再做 `opencode models` 发现  
   - 不引入 daemon runtime_id；本仓仍是 **CLI 类型 + model 字符串**

2. **G23 事件流**  
   - 复用 `GET /api/runs/:id/messages` + `run:message` WS  
   - UI：Issue/Runs/Agent 工作行 → 打开 **事件时间线抽屉**（对照真站色条 + tool 折叠），不要只做纯文本截断  
   - opencode：评估 JSON/流式 flag；若仍无流，至少在 live 显示 heartbeat/进度条 + 终态 assistant 块结构化

3. **G21 Inbox**  
   - 本地 **不是「没做收件箱」**：`http://localhost:3000/inbox` 已有（2026-07-21 Playwright：124 条可见、92 未读、侧栏 Inbox 角标）  
   - 下一刀目标是 **事件管理 + 交互**，不是从零新建路由

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

摘自 `references/deep/multica.md` + 2026-07-21 补读，供实现时对照，**非**本阶段必须 1:1：

1. **DB 行即锁**状态机 + claim 排除同 agent 同 scope 并发  
2. **Squad = leader task + briefing + mention**（本仓已钉）  
3. **FailStale + heartbeat**（本仓有 stale sweeper / run health）  
4. **Daemon + waiting_local_directory** → 本仓刻意用 cwd 持久化代替  
5. **Autopilot 模板 + webhook** → 模板可做；webhook 宪法不做  
6. **Runtime 注册机器** → 本地保留 CLI 探测即可  
7. **Agent.model**（`050_agent_model.up.sql`）+ backend `opts.Model` → CLI `--model`  
8. **Task 消息流** `TaskMessagePayload`（text / tool_use / tool_result）→ 本仓 `run_message` 应对齐可视化，不必 daemon drain 协议  

---

## 9. 建议迭代队列（厚切片顺序）

### 已完成（2026-07-19 波次，摘要）

G1–G18 主体（Inbox 双栏、Chat/Helper MVP、用量、项目、子 issue、订阅、PR URL、能力 Tab、模板画廊、CLI 文案…）— 见 git log / `*-impl-1.md`。

### 下一波（2026-07-21 人点名 · 按感知排序）

| 序 | 切片 | Gap | 用户路径 | 层 |
|---|---|---|---|---|
| 1 | **`inbox-agent-interact`** | G21 | Inbox 点通知 → 读全文 → **回复/私信/打开对话**；失败项运维动作保留 | web + chat/comment API |
| 2 | **`agent-model-binding`** | G22 | Agent 设置：runtime=opencode + **model=opencode/…** → 新 run 带 `--model` | schema+shared+server spawn+web |
| 3 | **`run-event-timeline`** | G23 | 运行中/历史 run → **工具调用时间线抽屉**（类真站弹层） | web 为主 + messages API；可选加固 opencode 流 |
| 4 | G19 / G20 / 密度 | 可选 | token CLI、设置叙事 | 薄 |

**刻意不做（仍有效）：** 云 webhook、多租户、密钥入库 UI、daemon 协议 1:1、waiting_local_directory 全状态机、把本机 CLI 伪装成「添加电脑」。

---

## 10. 达标重估（2026-07-21）

| 维度 | 判断 |
|---|---|
| 本地主航道日用（派活/看板/run/wiki/memory/settings） | **仍成立** |
| Inbox **路由与通知台** | **已有**（勿再写「没做收件箱」）；缺的是 **交互型事件中心** |
| 与 **真站产品壳** | MVP 壳在；**新的高感差距 = G21/G22/G23**（Inbox 交互、model、运行事件流） |
| 下一阶段目标 | **厚切片推进 G21→G22→G23**（可同会话串或拆刀）；G19/G20 仍非 blocker |

---

## 11. 巡览证据清单（2026-07-19 历史）

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

---

## 12. 巡览证据 · 2026-07-21

| 侧 | 证据 |
|---|---|
| 真站 `/inbox` | Playwright + storage-state：标题「收件箱」；列表含长交付摘要/状态变更；右侧「选择一条通知查看详情」；Helper「离线」+ 建议 chips；「已归档 10」 |
| 真站 `/issues` | 中文列待规划/待办/进行中…；FRI-14/15/10 等卡片 |
| 真站 agent 截图（用户） | 属性：**运行时 Opencode + 模型 opencode/big-pickle**；工作行可开 **执行事件时间线**（bash/skill/Agent） |
| 本仓 `/inbox` | Playwright：`data-testid=inbox-page`；**124** 条列表级、**92 未读**；侧栏 Inbox **角标 92**；失败条 28 |
| 本仓 agents | API/DB 四 agent **runtime=opencode**（已改 seed+DB）；详情 select **value=opencode**；**无 model 控件** |
| 本仓 run | `RunTrace` 存在但为扁平消息列表；opencode 注释写明执行期常无实时轨迹 |
