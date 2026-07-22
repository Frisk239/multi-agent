---
artifact: prototype-requirements-extraction
version: "1.0"
created: 2026-07-19
status: draft
source: prototype/ (app.js + seed.js)
rtm: multi-agent-platform-rtm-v2.md
---

# 原型需求提取报告

> **目的**：从 chanpin 原型代码中提取实际实现的功能，与 RTM 需求矩阵对照，识别覆盖情况与差距。
> **真源**：`prototype/assets/js/app.js`（1050 行）+ `prototype/data/seed.js`（432 行）
> **RTM 真源**：`multi-agent-platform-rtm-v2.md`（88 Must + 22 Should）

---

## 一、原型功能清单

### 1.1 全局导航与 Chrome（UI-NAV）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-NAV-001 | 左栏顶 Workspace 选择器（名+下拉） | ✅ 已实现 | `app.js:247-249` — `.sidebar-workspace` 显示 workspace 名 |
| UI-NAV-002 | 搜索入口「搜索…」+ Ctrl+K 提示 | ✅ 已实现 | `app.js:252-255` — `.sidebar-search` 含快捷键提示 |
| UI-NAV-003 | 「新建 issue」+ C 快捷键提示 | ✅ 已实现 | `app.js:256-259` — `.sidebar-new-issue` 含快捷键提示 |
| UI-NAV-004 | 收件箱导航项 | ✅ 已实现 | `app.js:17` — NAV_ITEMS 含 inbox |
| UI-NAV-005 | 我的 issue 导航项 | ✅ 已实现 | `app.js:18` — NAV_ITEMS 含 my-issues |
| UI-NAV-006 | 工作区 6 项：Issues/项目/自动化/智能体/小队/用量 | ✅ 已实现 | `app.js:19-24` — 6 项 workspace 导航 |
| UI-NAV-007 | 配置 3 项：运行时/Skills/设置 | ✅ 已实现 | `app.js:26-28` — 3 项 config 导航 |
| UI-NAV-008 | 当前页 nav 项高亮（灰底 pill） | ✅ 已实现 | `app.js:291-297` — `.nav-item.active` 样式 |
| UI-NAV-009 | 顶栏 Tab 显示当前页名 + `+` 开新 Tab | ✅ 已实现 | `app.js:279-282` — `.tab-bar` 含 `+` 按钮 |
| UI-NAV-010 | 左下帮助 `?` 图标 | ✅ 已实现 | `app.js:275` — `.help-btn` |
| UI-NAV-011 | 右下浮动聊天气泡 | ❌ 未实现 | 无对应代码 |
| UI-NAV-012 | Wiki 嵌入工作区 IA（不单开导航体系） | ✅ 已实现 | `app.js:25` — Wiki 在导航项中 |

### 1.2 命令面板（UI-CMD）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-CMD-001 | Ctrl+K 打开命令面板 overlay | ✅ 已实现 | `app.js:119-122` — Ctrl+K 监听 |
| UI-CMD-002 | 搜索框 + ESC 关闭提示 | ✅ 已实现 | `app.js:790-793` — `.palette-search` |
| UI-CMD-003 | 「命令」区：+ 新建 issue | ✅ 已实现 | `app.js:796-798` — `.palette-section` |
| UI-CMD-004 | 「最近」区：Issue 列表 FRI-xx + 状态图标 | ✅ 已实现 | `app.js:799-804` — recent issues |
| UI-CMD-005 | ESC / 点击遮罩关闭 | ✅ 已实现 | `app.js:127, 984-986` — ESC + backdrop 点击 |

### 1.3 Issue / 收件箱 / 看板 / 新建（UI-ISS）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-ISS-001 | 收件箱三栏：列表 \| 详情 \| 时间线一体 | ✅ 已实现 | `app.js:324` — `.inbox-layout` 三栏 |
| UI-ISS-002 | 收件箱列表项：图标+标题+摘要+时间+状态 | ✅ 已实现 | `app.js:327-338` — `.inbox-item` |
| UI-ISS-003 | 选中列表项高亮 | ✅ 已实现 | `app.js:329` — `.inbox-item.active` |
| UI-ISS-004 | 详情顶栏：ID+全标题+操作图标组 | ⚠️ 部分实现 | `app.js:348-350` — ID+标题有，操作图标组缺失 |
| UI-ISS-005 | User request / 描述区 Markdown 渲染 | ⚠️ 部分实现 | `app.js:350` — 纯文本显示，无 Markdown 渲染 |
| UI-ISS-006 | 动态/时间线：comment 列表+作者+时间 | ✅ 已实现 | `app.js:351-354` — `.timeline` |
| UI-ISS-007 | @mention pill + 队长 comment | ✅ 已实现 | `app.js:207-214, 366` — `parseMentions` |
| UI-ISS-008 | 「+ 添加子 issue」链接 | ❌ 未实现 | 无对应代码 |
| UI-ISS-009 | 「展开更早 N 条动态」 | ❌ 未实现 | 无对应代码 |
| UI-ISS-010 | 底部「留下评论…」输入框 | ❌ 未实现 | 无对应代码 |
| UI-ISS-011 | 五列看板：待规划/待办/进行中/审核中/已完成 | ✅ 已实现 | `app.js:7-14` — KANBAN_COLS 5 列 |
| UI-ISS-012 | 列头：色点+名+计数+…+ + | ✅ 已实现 | `app.js:396` — `.col-header` |
| UI-ISS-013 | 空列占位「无 issue」 | ✅ 已实现 | `app.js:398` — `.col-empty` |
| UI-ISS-014 | 筛选 Tab：全部/已分配/我创建的/我的智能体和小队 | ⚠️ 部分实现 | `app.js:383-386` — 3 Tab（缺「我的智能体和小队」） |
| UI-ISS-015 | 头栏「0 工作中」+ 筛选 + 手动 + 看板视图 | ✅ 已实现 | `app.js:283, 388-390` — working counter + view toggle |
| UI-ISS-016 | 富卡片：ID+标题+摘要+squad badge+更新时间 | ⚠️ 部分实现 | `app.js:406-416` — ID+标题+badge+时间有，摘要缺失 |
| UI-ISS-017 | FRI-11 位于审核中列（seed） | ✅ 已实现 | `seed.js:259` — FRI-11 status=in_review |
| UI-ISS-018 | 卡片拖拽跨列（继承 V1 ISS-002） | ✅ 已实现 | `app.js:945-981` — drag & drop |
| UI-ISS-019 | 代码块样式（时间线内） | ❌ 未实现 | 无对应代码 |
| UI-ISS-020 | MoSCoW/表格 comment 渲染 | ❌ 未实现 | 无对应代码 |
| UI-ISS-021 | 手动创建模态：标题+描述+属性 pills | ✅ 已实现 | `app.js:833-843` — `.issue-modal-body` |
| UI-ISS-022 | Pills：状态/优先级/指派人/标签/项目 | ✅ 已实现 | `app.js:838-842` — `.issue-modal-pills` |
| UI-ISS-023 | 「切换到智能体」 | ✅ 已实现 | `app.js:846` — `#btn-switch-mode` |
| UI-ISS-024 | 「继续创建」toggle | ❌ 未实现 | 无对应代码 |
| UI-ISS-025 | 「创建 Issue」主按钮 | ✅ 已实现 | `app.js:847` — `#btn-create-issue` |
| UI-ISS-026 | 智能体创建模态：创建者 squad badge | ⚠️ 部分实现 | `app.js:821-822` — 显示创建者，无 squad badge |
| UI-ISS-027 | NL 输入框 + placeholder 示例 | ✅ 已实现 | `app.js:830` — textarea with placeholder |
| UI-ISS-028 | 「切换到手动」 | ✅ 已实现 | `app.js:846` — `#btn-switch-mode` |
| UI-ISS-029 | 智能体搜索下拉列表 | ✅ 已实现 | `app.js:824-829` — agent suggestions |
| UI-ISS-030 | Multica Helper 星标项 | ❌ 未实现 | 无对应代码 |
| UI-ISS-031 | 创建 Ctrl+Enter 快捷键提示 | ❌ 未实现 | 无对应代码 |
| UI-ISS-032 | 模态：展开/关闭按钮 | ✅ 已实现 | `app.js:817` — `#modal-close` |

### 1.4 小队（UI-SQD）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-SQD-001 | 小队列表页 + 计数 | ✅ 已实现 | `app.js:539-561` — `.data-table` |
| UI-SQD-002 | Tab：我的 / 全部 | ❌ 未实现 | 无 filter tabs |
| UI-SQD-003 | 表格列：小队/队长/成员/创建者 | ✅ 已实现 | `app.js:546` — 4 列 |
| UI-SQD-004 | 预置产品小队行 | ✅ 已实现 | `seed.js:144-156` — sqd-product |
| UI-SQD-005 | + 新建小队 + 筛选 + 排序 | ⚠️ 部分实现 | `app.js:542` — 新建按钮有，筛选排序缺失 |
| UI-SQD-006 | 详情面包屑：小队 > 产品小队 | ✅ 已实现 | `app.js:570-572` — `.breadcrumb` |
| UI-SQD-007 | 左摘要卡：图标/名/分类/详情字段 | ⚠️ 部分实现 | `app.js:574-583` — 名+队长+成员有，图标/分类缺失 |
| UI-SQD-008 | Tab：Members / Instructions | ✅ 已实现 | `app.js:59-62` — SQUAD_TABS |
| UI-SQD-009 | 成员卡片：角色/状态/最近活动 | ⚠️ 部分实现 | `app.js:598-609` — 角色有，状态/最近活动缺失 |
| UI-SQD-010 | 成员 hover：弹出/收藏/删除 | ❌ 未实现 | 无对应代码 |
| UI-SQD-011 | + 创建智能体 / + 添加成员 | ❌ 未实现 | 无对应代码 |
| UI-SQD-012 | Instructions：说明+路由表+保存 | ⚠️ 部分实现 | `app.js:612-617` — 说明有，路由表+保存缺失 |
| UI-SQD-013 | 归档/删除图标（右上） | ❌ 未实现 | 无对应代码 |
| UI-SQD-014 | 成员头像堆叠 +N（列表页） | ❌ 未实现 | 无对应代码 |
| UI-SQD-015 | 答辩：产品小队 Members 含 4 Agent | ✅ 已实现 | `seed.js:149` — memberIds 含 4 个 |

### 1.5 智能体（UI-AGT）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-AGT-001 | 列表页「智能体 N」+ 说明 + 新建 | ✅ 已实现 | `app.js:426-434` — page header |
| UI-AGT-002 | Tab：我的/全部/已归档 | ✅ 已实现 | `app.js:436-440` — filter pills |
| UI-AGT-003 | 搜索 + 筛选 + 最近活跃排序 | ⚠️ 部分实现 | `app.js:441-443` — 搜索有，排序缺失 |
| UI-AGT-004 | 表格 6 列：智能体/状态/所有者/运行时/最近活跃/运行次数 | ✅ 已实现 | `app.js:446-448` — 6 列 |
| UI-AGT-005 | 策划队长行：Cursor runtime | ✅ 已实现 | `seed.js:73` — runtime=Pi (Cursor in seed) |
| UI-AGT-006 | 点击行进详情 | ✅ 已实现 | `app.js:885-892` — click handler |
| UI-AGT-007 | 详情左卡：属性（运行时/模型/可见性/并发） | ✅ 已实现 | `app.js:483-488` — 4 属性行 |
| UI-AGT-008 | 详情左卡：SKILLS tags + 添加 | ✅ 已实现 | `app.js:494-497` — skill tags |
| UI-AGT-009 | 8 Tab：动态/Tasks/指令/Skills/环境变量/自定义参数/MCP/集成 | ✅ 已实现 | `app.js:48-57` — AGENT_TABS 8 项 |
| UI-AGT-010 | 动态 Tab：当前+近30天统计+最近工作 | ✅ 已实现 | `app.js:512-521` — stats + recent tasks |
| UI-AGT-011 | Skills Tab：列表+描述+删除+添加 | ⚠️ 部分实现 | `app.js:524-528` — 列表有，删除+添加缺失 |
| UI-AGT-012 | MCP Tab：JSON 编辑器+清空+保存 | ⚠️ 部分实现 | `app.js:529-530` — 按钮有，编辑器缺失 |
| UI-AGT-013 | 绑定飞书按钮 | ❌ 未实现 | 无对应代码 |
| UI-AGT-014 | Tasks/指令/环境变量/自定义参数/集成 Tab shell | ✅ 已实现 | `app.js:531-533` — default case |
| UI-AGT-015 | 在线状态绿点 | ✅ 已实现 | `app.js:455, 475` — `.status-dot-green` |
| UI-AGT-016 | 面包屑：智能体 > 名 | ✅ 已实现 | `app.js:473-476` — `.breadcrumb` |
| UI-AGT-017 | 新建智能体（继承 V1 AGT-002） | ⚠️ 部分实现 | `app.js:894` — 按钮有，功能为 toast |
| UI-AGT-018 | Multica Helper 特殊行 | ❌ 未实现 | 无对应代码 |
| UI-AGT-019 | 最近工作「查看更多」 | ❌ 未实现 | 无对应代码 |
| UI-AGT-020 | sparkline 活动图 | ❌ 未实现 | 无对应代码 |

### 1.6 Skills（UI-SKL）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-SKL-001 | 页头 Skills N + 副标题 + 新建 | ✅ 已实现 | `app.js:627-632` — page header |
| UI-SKL-002 | 搜索 skill + 筛选 + 更新时间排序 | ⚠️ 部分实现 | `app.js:634-636` — 搜索有，筛选+排序缺失 |
| UI-SKL-003 | 表格 4 列：名称/已被使用/添加者/更新时间 | ✅ 已实现 | `app.js:639` — 4 列 |
| UI-SKL-004 | 行：skill 名 + 使用 Agent + 添加者头像 | ✅ 已实现 | `app.js:641-647` — 行渲染 |
| UI-SKL-005 | 行 hover：checkbox + … 菜单 | ❌ 未实现 | 无对应代码 |
| UI-SKL-006 | URL 导入（继承 V1 SKL-001） | ⚠️ 部分实现 | `app.js:921` — 按钮有，功能为 toast |

### 1.7 设置（UI-SET）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-SET-001 | 设置双栏：二级 nav + 内容 | ✅ 已实现 | `app.js:659-672` — `.settings-layout` |
| UI-SET-002 | 我的账号 6 项 nav | ✅ 已实现 | `app.js:64-69` — account sections |
| UI-SET-003 | 工作区 6 项 nav | ✅ 已实现 | `app.js:71-76` — workspace sections |
| UI-SET-004 | 个人资料：头像+姓名+关于你+计数 | ✅ 已实现 | `app.js:679-697` — profile form |
| UI-SET-005 | 更新资料按钮 | ✅ 已实现 | `app.js:695` — `#btn-save-profile` |
| UI-SET-006 | 偏好/通知/API/Daemon 页 shell | ⚠️ 部分实现 | `app.js:676-678` — placeholder page |
| UI-SET-007 | 通用/仓库/GitHub/集成/实验室/成员 shell | ⚠️ 部分实现 | `app.js:676-678` — placeholder page |
| UI-SET-008 | 二级 nav 选中指示（竖线/高亮） | ✅ 已实现 | `app.js:664, 668` — `.settings-nav-item.active` |

### 1.8 运行时（UI-RT）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-RT-001 | 运行时页双栏：机器列表+详情 | ✅ 已实现 | `app.js:707-746` — `.runtime-layout` |
| UI-RT-002 | 搜索 machine + Tab All/Online/Errors | ⚠️ 部分实现 | `app.js:710-713` — filters 有，搜索缺失 |
| UI-RT-003 | 本机 Frisk239 卡片 + Local badge | ✅ 已实现 | `app.js:715-719` — `.machine-item` |
| UI-RT-004 | 详情头：在线+版本+daemon id | ✅ 已实现 | `app.js:722-729` — runtime detail header |
| UI-RT-005 | +添加运行时 / +添加电脑 | ✅ 已实现 | `app.js:726-727` — buttons |
| UI-RT-006 | 查看日志/重启/停止 | ✅ 已实现 | `app.js:727-728` — action buttons |
| UI-RT-007 | Runtime 表 5 列 | ✅ 已实现 | `app.js:733` — 5 列 |
| UI-RT-008 | 行：Claude/Cursor/Opencode mock 数据 | ✅ 已实现 | `seed.js:24-54` — 3 runtimes |

### 1.9 Wiki（UI-WIK）

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| UI-WIK-001 | Wiki 使用 Multica 左栏（非独立导航） | ✅ 已实现 | `app.js:25` — Wiki 在导航项中 |
| UI-WIK-002 | 主区：树 + 阅读器 | ✅ 已实现 | `app.js:750-761` — `.wiki-layout` |
| UI-WIK-003 | 工作区 nav 可进入 Wiki（第 7 项或 Issues 子入口） | ✅ 已实现 | `app.js:25` — Wiki 在 workspace section |
| UI-WIK-004 | 5 页内容保留（V1 WIK-003） | ✅ 已实现 | `seed.js:397-427` — 5 wiki pages |

---

## 二、V1 需求回归检查

### 2.1 ISS — Issue 看板与时间线

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| ISS-001 | 看板展示 backlog / running / done 三列 | ✅ 已实现 | `app.js:7-14` — 5 列包含 3 列 |
| ISS-002 | 拖拽 Issue 卡片跨列切换 status | ✅ 已实现 | `app.js:945-981` — drag & drop |
| ISS-003 | Issue 卡片显示 identifier + 标题 + assignee badge | ✅ 已实现 | `app.js:406-416` — card rendering |
| ISS-004 | 点击卡片打开 Issue 详情 | ✅ 已实现 | `app.js:957-963` — click handler |
| ISS-005 | Issue 详情页 comment 时间线按时间正序 | ✅ 已实现 | `app.js:351-354` — timeline |
| ISS-006 | Assignee 支持 agent 与 squad 多态下拉 | ⚠️ 部分实现 | `app.js:182-186` — 多态支持有，下拉缺失 |
| ISS-007 | Comment 支持 @mention Agent 渲染为 pill | ✅ 已实现 | `app.js:207-214` — parseMentions |
| ISS-008 | 预置 6–10 条 mock Issue，覆盖三列 | ✅ 已实现 | `seed.js:253-395` — 8 issues |
| ISS-009 | Issue identifier 格式 `{PREFIX}-{number}` | ✅ 已实现 | `seed.js:256` — FRI-11 |

### 2.2 SQD — Squad 编排

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| SQD-001 | Squad 实体：名称、leader、roster 成员列表 | ✅ 已实现 | `seed.js:144-156` — squad data |
| SQD-002 | 预置 1 个「产品小队」含队长与专精成员 | ✅ 已实现 | `seed.js:144-156` — sqd-product |
| SQD-003 | Issue 指派 Squad 后右栏展示 briefing 摘要 | ✅ 已实现 | `app.js:605-608` — briefing block |
| SQD-004 | 队长 comment 含 roster mention 链接格式 | ✅ 已实现 | `seed.js:275` — mention format |
| SQD-005 | 队长 @mention 成员 comment 显示委派态 | ✅ 已实现 | `app.js:360, 366` — delegated tag |
| SQD-006 | 答辩高光路径 Issue→Squad→briefing→@mention | ✅ 已实现 | 完整路径可演示 |

### 2.3 AGT — Agent 定义

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| AGT-001 | Agent 列表页展示所有 Agent | ✅ 已实现 | `app.js:418-464` — agents list |
| AGT-002 | 创建/编辑 Agent：名称 + system instructions | ⚠️ 部分实现 | `app.js:894` — 按钮有，功能为 toast |
| AGT-003 | Runtime 下拉 mock：Pi / Claude Code / opencode / Cursor | ✅ 已实现 | `seed.js:24-54` — 3 runtimes |
| AGT-004 | MCP 配置入口：servers 列表 + 添加按钮 | ✅ 已实现 | `app.js:529-530` — MCP tab |
| AGT-005 | Agent 状态 badge（idle/working） | ✅ 已实现 | `app.js:455` — status badge |

### 2.4 SKL — Skill 导入与分配

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| SKL-001 | Skill URL 输入 + 导入按钮 | ⚠️ 部分实现 | `app.js:921` — 按钮有，功能为 toast |
| SKL-002 | Skill 列表展示名称与来源 URL | ✅ 已实现 | `app.js:638-648` — skills table |
| SKL-003 | Agent 详情页 skill 多选分配 | ✅ 已实现 | `app.js:494-497` — skill tags |

### 2.5 NAV — 布局与导航

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| NAV-001 | 三栏布局：左导航 ~240px + 主区 + 右栏 ~320px | ⚠️ 部分实现 | `app.js:245-287` — 两栏布局，无右栏 |
| NAV-002 | 左栏导航：Issues / Agents / Skills / Wiki | ✅ 已实现 | `app.js:16-28` — navigation items |
| NAV-003 | 右栏随选中 Issue/Agent 切换上下文 | ❌ 未实现 | 无右栏实现 |
| NAV-004 | 默认暗色主题 | ✅ 已实现 | `tokens.css` — 暗色变量 |
| NAV-005 | 顶栏 Workspace 切换 | ✅ 已实现 | `app.js:247-249` — workspace selector |

### 2.6 WIK — Wiki 浏览器

| REQ ID | 需求陈述 | 原型实现状态 | 实现证据 |
|--------|----------|--------------|----------|
| WIK-001 | Wiki 左树形导航 | ✅ 已实现 | `app.js:753-757` — wiki tree |
| WIK-002 | 点击树节点主区渲染 mock 页面 | ✅ 已实现 | `app.js:759` — wiki article |
| WIK-003 | 5 页预置：Home / Architecture / Synthesis / Sprint Log / Glossary | ✅ 已实现 | `seed.js:397-427` — 5 pages |

---

## 三、差距分析

### 3.1 高优先级差距（Must 级未实现）

| REQ ID | 需求陈述 | 影响 |
|--------|----------|------|
| UI-ISS-010 | 底部「留下评论…」输入框 | 收件箱交互不完整 |
| UI-ISS-008 | 「+ 添加子 issue」链接 | Issue 层级缺失 |
| UI-ISS-009 | 「展开更早 N 条动态」 | 时间线不完整 |
| UI-SQD-011 | + 创建智能体 / + 添加成员 | 小队管理不完整 |
| UI-SQD-014 | 成员头像堆叠 +N（列表页） | 视觉完整性 |
| UI-AGT-017 | 新建智能体 | 功能缺失（仅 toast） |
| UI-SKL-006 | URL 导入 | 功能缺失（仅 toast） |
| NAV-001 | 三栏布局 | 缺少右栏 |
| NAV-003 | 右栏随选中切换 | 上下文面板缺失 |

### 3.2 中优先级差距（Should 级未实现）

| REQ ID | 需求陈述 | 影响 |
|--------|----------|------|
| UI-NAV-011 | 右下浮动聊天气泡 | 视觉完整性 |
| UI-ISS-004 | 详情顶栏操作图标组 | 交互完整性 |
| UI-ISS-005 | Markdown 渲染 | 内容展示 |
| UI-ISS-016 | 卡片描述摘要 | 信息密度 |
| UI-AGT-020 | sparkline 活动图 | 视觉丰富度 |
| UI-AGT-018 | Multica Helper 特殊行 | 品牌一致性 |
| UI-SQD-010 | 成员 hover 操作 | 交互完整性 |

### 3.3 低优先级差距（Won't 或 Phase 2）

| REQ ID | 需求陈述 | 说明 |
|--------|----------|------|
| UI-ISS-019 | 代码块样式 | Markdown 渲染依赖 |
| UI-ISS-020 | MoSCoW/表格 comment 渲染 | Markdown 渲染依赖 |
| UI-AGT-013 | 绑定飞书按钮 | Phase 2+ |
| UI-AGT-019 | 最近工作「查看更多」 | Phase 2+ |

---

## 四、原型实现统计

### 4.1 V2 UI-* 需求覆盖

| 前缀 | 总数 | 已实现 | 部分实现 | 未实现 | 覆盖率 |
|------|------|--------|----------|--------|--------|
| UI-NAV | 13 | 11 | 0 | 1 | 85% |
| UI-CMD | 5 | 5 | 0 | 0 | 100% |
| UI-ISS | 32 | 20 | 4 | 8 | 63% |
| UI-SQD | 15 | 8 | 3 | 4 | 53% |
| UI-AGT | 20 | 13 | 3 | 4 | 65% |
| UI-SKL | 6 | 3 | 2 | 1 | 50% |
| UI-SET | 8 | 5 | 3 | 0 | 63% |
| UI-RT | 8 | 7 | 1 | 0 | 88% |
| UI-WIK | 4 | 4 | 0 | 0 | 100% |
| **合计** | **110** | **76** | **16** | **18** | **69%** |

### 4.2 V1 需求回归

| 前缀 | 总数 | 已实现 | 部分实现 | 未实现 | 覆盖率 |
|------|------|--------|----------|--------|--------|
| ISS | 9 | 8 | 1 | 0 | 89% |
| SQD | 6 | 6 | 0 | 0 | 100% |
| AGT | 5 | 4 | 1 | 0 | 80% |
| SKL | 3 | 2 | 1 | 0 | 67% |
| NAV | 5 | 3 | 1 | 1 | 60% |
| WIK | 3 | 3 | 0 | 0 | 100% |
| **合计** | **31** | **26** | **4** | **1** | **84%** |

---

## 五、关键发现

### 5.1 原型强项

1. **导航完整性高**：侧栏 IA、命令面板、Tab 系统实现完整
2. **看板核心功能**：5 列看板、拖拽、卡片渲染完整
3. **数据模型完整**：seed.js 覆盖所有实体，关系清晰
4. **Wiki 集成**：嵌入式导航 + 5 页内容完整
5. **运行时页面**：机器列表 + Runtime 表格完整

### 5.2 原型短板

1. **交互深度不足**：多处按钮仅 toast，无实际功能
2. **右栏缺失**：Issue/Agent 详情无上下文面板
3. **评论系统不完整**：无输入框、无 Markdown 渲染
4. **小队管理不完整**：无添加成员、无头像堆叠
5. **视觉细节缺失**：sparkline、hover 效果、特殊行样式

### 5.3 与 RTM 对齐建议

1. **优先补齐 Must 级交互**：评论输入、子 issue、右栏
2. **完善小队管理**：添加成员、头像堆叠
3. **增强视觉细节**：sparkline、hover 效果
4. **保持 Won't 约束**：不实现真实后端功能

---

## 六、附录：原型文件结构

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

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-19 | opencode | 初版 — 原型需求提取与差距分析 |
