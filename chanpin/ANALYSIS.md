# chanpin 原型调研报告

> 调研：2026-07-08 · 基于对 `chanpin/` 全量文档 + 原型源码的阅读

## 这是什么

`chanpin/`（产品）是 PM agent 小队（策划队长 + 调研/PRD/原型三个队员）按 multica 的小队协作模式，**自己产出的产品规格 + 可交互原型**。它本身就是一个 multica 小队工作流的活样本——FRI-11 这个 issue 的完整时间线（队长 briefing → @mention 委派 → 队员交付）就嵌在原型 seed 数据里。

### 产物清单

| 类别 | 文件 | 价值 |
|---|---|---|
| 产品简报 | `PRODUCT-BRIEF.md` | 7 问诊断 + MoSCoW + V1→V2 差异 |
| 问题陈述 | `docs/problem-statement.md` | 痛点定义、成功指标 |
| 能力契约 | `docs/product-capability.md` | 数据模型/状态机/信任边界/接口契约 |
| 信息架构 | `docs/design/multi-agent-platform-ia.md` | 页面清单、看板五列、Tab 结构 |
| **V2 RTM** | `docs/prd/multi-agent-platform-rtm-v2.md` | **88 Must + 22 Should 需求矩阵** |
| UI 清点 | `docs/prd/multica-ui-replica-inventory.md` | 逐张截图 → REQ 映射 |
| 竞品分析 | `research/competitive-analysis.md` | 竞品矩阵 |
| **原型代码** | `prototype/` | **已验收的可交互 HTML 原型** |

---

## 原型技术架构

### 技术栈：零框架纯原生

```
prototype/
├── index.html              入口，挂载 #app + #modal-root
├── data/
│   ├── seed.js             window.__SEED__ 全局数据对象（431 行）
│   └── seed.json           seed.js 的 JSON 副本（异步加载 fallback）
├── assets/
│   ├── css/
│   │   ├── tokens.css      设计 token（暗色主题变量，73 行）
│   │   └── app.css         全部样式（504 行）
│   └── js/
│       └── app.js          SPA 逻辑（1050 行）
└── test_v2_paths.py        Playwright 冒烟测试
```

**设计决策：** 不用 React/Vue/任何框架。纯字符串模板 + `innerHTML` 全量重渲染。这个选择对一个原型很合理——无构建步骤、双击 `index.html` 即可运行、易读易改。

### 状态管理：闭包单例

```javascript
// app.js:79-102
const state = {
  view: 'inbox',              // 当前视图
  tabs: [...], activeTabId,   // 顶栏 Tab
  selectedInboxId,            // 收件箱选中项
  selectedIssueId,
  selectedAgentId,
  selectedSquadId,
  selectedMachineId,
  selectedWikiId,
  settingsSection,
  agentDetailTab,             // Agent 详情 8 Tab 哪个激活
  squadDetailTab,             // Squad 详情 2 Tab 哪个激活
  boardFilter,                // 看板筛选
  modal: null,                // 当前模态
  newIssueMode: 'agent',      // 新建 Issue 双模态
  data: null                  // structuredClone(window.__SEED__)
};
```

所有状态在一个闭包对象里，`navigate()` 改状态 → `render()` 全量重渲染。

### 渲染：字符串模板 + innerHTML

```javascript
function render() {
  app.innerHTML = renderShell();    // 侧栏 + 顶栏 + 主区
  bindShellEvents();                 // 重新绑定所有事件
  renderModal();
}
```

`renderView()` 按 `state.view` switch 到对应渲染函数。每个渲染函数返回 HTML 字符串。

---

## 数据模型（核心——这是你毕设 DB schema 的起点）

seed.js 的数据结构已经非常接近最终生产 schema：

### Issue

```javascript
{
  id: "iss-11",
  identifier: "FRI-11",          // 人类可读 ID
  title: "...",
  description: "...",
  status: "in_review",            // planning|todo|in_progress|in_review|done
  priority: "high",
  assignee: { type: "squad", id: "sqd-product" },  // ★ 多态指派
  updatedAt: ISO,
  comments: [...]                 // 时间线
}
```

**关键：`assignee: { type, id }` 就是 multica 的多态指派模式。** `type` 是 `'agent' | 'squad' | null`（未指派）。这与 `design/synthesis.md §2.4` 的 TS 实现完全吻合。

### Comment（Issue 时间线条目）

```javascript
{
  id: "c2",
  authorType: "agent",            // human | agent
  authorId: "agt-lead",           // agent 时有 id
  authorName: "林远",             // human 时有 name
  body: "...",                     // Markdown，含 [@Name](mention://agent/<uuid>)
  timestamp: ISO,
  delegated: true                  // 队长委派标记
}
```

**关键：`mention://agent/<id>` 是 multica 的 mention 协议。** `parseMentions()`（app.js:207）把它渲染成 `.mention-pill`。生产实现里，这个 mention 会触发 comment-trigger 路由（见 [deep/multica.md](../references/deep/multica.md) §3）。

### Agent

```javascript
{
  id: "agt-lead",
  name: "产品·策划队长",
  role: "leader",                  // leader | member
  category: "产品",
  runtime: "Pi",                   // ★ 绑定的运行时
  runtimeLabel: "Pi (林远)",
  status: "online",
  ownerId: "user-linyuan",
  lastActive, runCount,
  instructions: "...",             // 系统指令
  skillIds: ["skl-squads", ...],   // ★ Skill 分配
  mcpServers: [],                  // ★ MCP 配置
  model: "auto",
  visibility: "workspace",
  concurrency: 6,
  recentTasks: [...]               // 动态 Tab 数据
}
```

**这已经覆盖了你强调的全部体验要素：** `runtime` 字段（多运行时绑定）、`skillIds`（按 agent 分配 skill）、`instructions`（每个 agent 的指令）、`mcpServers`（MCP 支持）。

### Squad

```javascript
{
  id: "sqd-product",
  name: "产品小队",
  leaderId: "agt-lead",            // ★ 恰好一个 leader
  memberIds: ["agt-research", "agt-prd", "agt-proto"],
  creatorId, creatorName,
  operatingProtocol: "1. 队长接收...\n2. 按专精 @mention...",  // ★ briefing 第一段
  missionDirective: "...",         // ★ briefing 指令段
  issueCount: 3,
  updatedAt
}
```

**这就是 multica Squad 的数据形态：** leader + roster + operating protocol（注入 leader 的 system prompt）+ mission directive。生产实现里，claim 任务时把这两段 + roster 的 `[@Name](mention://agent/<id>)` 拼成 briefing 注入 leader agent 的上下文。

### Skill

```javascript
{
  id: "skl-squads",
  name: "multica-squads",
  url: "https://github.com/example/multica-squads",  // ★ URL 导入
  usedBy: { type: "agent", id: "agt-lead", label: "..." },  // ★ 被谁使用
  addedBy: { id, name },
  updatedAt
}
```

**URL 导入 + 被谁使用追踪** —— 与你的体验目标一致。

### Runtime / Machine

```javascript
// machine（本机）
{ id: "machine-local", name: "林远 本机", type: "local", status: "online",
  runtimeCount: 3, version: "v0.3.40-mock", daemonId: "..." }

// runtime（绑定到 machine 的 CLI）
{ id: "rt-cursor", machineId: "machine-local", name: "Cursor 内置",
  type: "Cursor", health: "online",
  agentIds: ["agt-proto", ...],     // ★ 哪些 agent 用这个 runtime
  cost7d: 3.31, cliVersion: "..." }
```

**Machine ↔ Runtime ↔ Agent 三层：** Machine 是物理机（纯本地只有一台），Runtime 是机器上的一个 CLI（Claude/Cursor/opencode），Agent 绑定一个 Runtime。这正是 [synthesis.md §2.6](../design/synthesis.md) 的 `RuntimeBackend` 接口的数据层映射。

---

## 原型实现的功能（对照 V2 RTM 88 Must）

### ✅ 完整实现

| 模块 | RTM 前缀 | 原型实现 |
|---|---|---|
| 全局侧栏 IA（搜索+新建+收件箱+我的issue+工作区6项+配置3项） | UI-NAV | 12 项导航，高亮态，顶栏 Tab |
| 命令面板 Ctrl+K | UI-CMD | 搜索 + 最近 issue 列表 + ESC 关闭 |
| **收件箱三栏**（列表+详情+时间线） | UI-ISS | inboxItem 选中、issue 时间线、comment 渲染 |
| **五列看板 + 拖拽** | UI-ISS | `bindKanbanDrag()` HTML5 drag/drop 跨列 |
| 新建 Issue 双模态（智能体/手动切换） | UI-ISS | `renderNewIssueModal()` + mode 切换 |
| **小队列表 + 详情（Members/Instructions）** | UI-SQD | roster + leader 高亮 + operating protocol 展示 |
| **智能体列表 + 详情 8 Tab** | UI-AGT | 动态/Tasks/指令/Skills/环境变量/自定义参数/MCP/集成 |
| Skills 表格 + 搜索 | UI-SKL | 名称/被谁使用/添加者/更新时间 |
| 设置二级导航 | UI-SET | 我的账号6项 + 工作区6项，个人资料表单 |
| 运行时页（机器列表 + Runtime 表格） | UI-RT | machine 选中 + runtime 表 5 列 |
| Wiki 浏览器 | UI-WIK | 树 + 阅读区，5 页 mock |
| @mention pill 渲染 | UI-ISS-007 | `parseMentions()` 正则 + DOM |

### ⚠️ 占位/简化（你说的"略微粗糙"）

| 功能 | 状态 | 备注 |
|---|---|---|
| 看板拖拽 | ✅ 可用 | HTML5 drag/drop，比你说"没有拖动"实际是有的 |
| 看板→列表视图切换 | UI 壳在，列表未实现 | 按钮存在但不切换 |
| Agent/Skill 新建 | `showToast('Phase 2')` | 未实现表单 |
| MCP JSON 编辑器 | 占位文字 | 未实现编辑器 |
| 项目/自动化/用量 | `renderPlaceholder()` | Phase 2 占位页 |
| sparkline 活动图 | 文字统计 | 未画图 |

---

## 原型对毕设的价值

### 1. 它是「数据模型契约」的活样本

seed.js 的结构可以直接转成 Drizzle schema。对照 [synthesis.md §2.4](../design/synthesis.md) 的 TS 类型：

| seed.js 字段 | 生产表 | multica 对应 |
|---|---|---|
| `issue.assignee.{type,id}` | `issues.assigneeType + assigneeId` | `(type,id)` 多态指派 |
| `squad.leaderId + memberIds` | `squad + squad_member` | leader + roster |
| `agent.runtime` | `agent.runtimeId → runtime` | Backend 绑定 |
| `agent.skillIds` | `agent_skill` join table | skill 分配 |
| `comment.authorType + authorId` | `comment.authorType + authorId` | 多态作者 |
| `comment.body` 的 `mention://agent/<id>` | comment + mention 解析 | comment-trigger 路由源 |

### 2. 它是「UI 视觉契约」的真源

生产前端（Next.js）应该**复刻这个原型的信息架构和视觉**，只是把 `window.__SEED__` 换成 API 调用、把 `innerHTML` 换成 React 组件、把 mock 事件换成 WebSocket。

原型的 `tokens.css` 已经定义了设计系统：

```css
--bg: #0a0a0a;          /* 背景 */
--panel: #161616;       /* 面板 */
--sidebar-width: 220px;
/* 等 73 行 token */
```

### 3. 它验证了「答辩 demo 路径」可行

原型的 FRI-11 seed 数据就是一条完整的答辩路径：
1. 收件箱/看板 → 选中 FRI-11（指派产品小队）
2. 时间线见队长 briefing comment + @mention pill（委派三个队员）
3. 队员交付 comment 在同一条时间线
4. 小队详情 → Members 见 4 人 roster + Operating Protocol

**生产版只要把这个路径从 mock 数据换成真实 agent 执行，就是答辩 demo。**

### 4. 它暴露了原型没覆盖的「真实实现缺口」

原型是纯前端 mock，以下是从原型到生产必须补的：

| 原型 mock | 生产要做 | 对应层 |
|---|---|---|
| `issue.status` 靠 `bindKanbanDrag` 直接改 | DB 状态机（条件 UPDATE + lease） | 编排 |
| `comment.body` mention 只渲染 | mention 触发 comment-trigger → enqueue | 编排 |
| `agent.runtime` 是字符串 label | `RuntimeBackend` 接口 + `detect()` + `execute()` | 执行 |
| `squad.leaderId` 只展示 | claim 时注入 briefing 到 leader system prompt | 编排 |
| `skill.url` 不拉取 | 真实拉取 skill 内容（Phase 1c） | 执行 |
| `agent.mcpServers` 空数组 | MCP server 连接 + tool 注入 | 执行 |
| 全量 `innerHTML` 重渲染 | WebSocket 增量推送 + React 状态更新 | 前端 |
| `window.__SEED__` | SQLite/PostgreSQL + Drizzle ORM | 数据 |

---

## 对开发节奏的影响

原型把「产品长什么样」这个问题彻底回答了。原来的 roadmap Phase 0-1 里隐含的「设计 UI」工作已经被原型预完成了。调整建议：

| 原 Phase | 调整 |
|---|---|
| Phase 0 | 不用再设计 UI——原型就是规格。直接按原型 IA 搭 Next.js + 后端骨架 |
| Phase 1a | 后端实现 seed.js 的数据模型 + 状态机；前端从原型移植组件 |
| Phase 1b | Squad briefing 注入 + mention-trigger 路由（原型的 comment 闭环） |
| Phase 1c | Skill URL 真实拉取 + MCP 连接（原型只 mock 了 UI） |

**一句话：原型把毕设的「产品不确定性」清零了。剩下的全是工程实现。**
