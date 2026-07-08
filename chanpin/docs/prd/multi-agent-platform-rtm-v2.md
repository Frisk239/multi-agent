---
artifact: rtm-v2-increment
version: "2.0"
created: 2026-07-08
status: draft
parent: multi-agent-platform-rtm.md
inventory: multica-ui-replica-inventory.md
---

# RTM V2 增量 — Multica UI Replica

> **优先级**：V2 Must = 功能模块 shell 齐全、可点通（mock）  
> **Should** = 视觉高保真、Tab 内容填充深度  
> **Won't** = 真实 CLI / DB / WS / GitHub API  
> **真源**：`multica-image/ref1–ref18`（inventory 逐张清点）  
> **V1 回归**：原 ISS/SQD/AGT/SKL/NAV/WIK 32 条 Must 仍须满足（FRI-11 答辩路径）

---

## UI-NAV — 全局导航与 Chrome

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-NAV-001 | 左栏顶 Workspace 选择器（名+下拉） | Must | 全部 | **G** 任意页 **W** 加载 **T** 显示 workspace 名（如 Frisk239's codi…） |
| UI-NAV-002 | 搜索入口「搜索…」+ Ctrl+K 提示 | Must | ref6 | **G** 侧栏 **W** 目视 **T** 搜索项含快捷键标注 |
| UI-NAV-003 | 「新建 issue」+ C 快捷键提示 | Must | ref7 | **G** 侧栏 **W** 点击 **T** 打开创建模态（智能体或手动） |
| UI-NAV-004 | 收件箱导航项 | Must | ref3 | **G** 侧栏 **W** 点击 **T** 进入三栏收件箱 |
| UI-NAV-005 | 我的 issue 导航项 | Must | ref7 | **G** 侧栏 **W** 点击 **T** 进入五列看板 |
| UI-NAV-006 | 工作区 6 项：Issues/项目/自动化/智能体/小队/用量 | Must | ref9 | **G** 侧栏 **W** 逐项点击 **T** 6 项均可导航（用量可空壳） |
| UI-NAV-007 | 配置 3 项：运行时/Skills/设置 | Must | ref14 | **G** 侧栏 **W** 点击 **T** 分别进入三页 |
| UI-NAV-008 | 当前页 nav 项高亮（灰底 pill） | Must | ref1 | **G** 在 Skills 页 **W** 目视 **T** Skills 项高亮 |
| UI-NAV-009 | 顶栏 Tab 显示当前页名 + `+` 开新 Tab | Must | ref7 | **G** 看板页 **T** Tab 显示「My Issues」类标题 + `+` |
| UI-NAV-010 | 左下帮助 `?` 图标 | Should | ref2 | 可见可点（可 noop） |
| UI-NAV-011 | 右下浮动聊天气泡 | Should | ref3 | 可见 |
| UI-NAV-012 | Wiki 嵌入工作区 IA（不单开导航体系） | Must | V1 | **G** Wiki 页 **W** 点击 **T** 保留 Multica 左栏，主区 Wiki 树+阅读器 |

---

## UI-CMD — 命令面板

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-CMD-001 | Ctrl+K 打开命令面板 overlay | Must | ref6 | **G** 任意页 **W** Ctrl+K **T** 模态居中、背景模糊 |
| UI-CMD-002 | 搜索框 + ESC 关闭提示 | Must | ref6 | 面板顶栏含 placeholder 与 ESC |
| UI-CMD-003 | 「命令」区：+ 新建 issue | Must | ref6 | 命令区至少 1 条可点击新建 |
| UI-CMD-004 | 「最近」区：Issue 列表 FRI-xx + 状态图标 | Must | ref6 | ≥5 条最近 issue，含 FRI-11 |
| UI-CMD-005 | ESC / 点击遮罩关闭 | Must | ref6 | **W** ESC **T** 面板消失 |

---

## UI-ISS — Issue / 收件箱 / 看板 / 新建

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-ISS-001 | 收件箱三栏：列表 \| 详情 \| 时间线一体 | Must | ref3 | 同屏三区域可辨 |
| UI-ISS-002 | 收件箱列表项：图标+标题+摘要+时间+状态 | Must | ref3 | 每行含相对时间 |
| UI-ISS-003 | 选中列表项高亮 | Must | ref3 | 选中行背景区分 |
| UI-ISS-004 | 详情顶栏：ID+全标题+操作图标组 | Must | ref3 | FRI-11 格式 + 时钟/关闭等 |
| UI-ISS-005 | User request / 描述区 Markdown 渲染 | Must | ref3 | 含标题、段落 |
| UI-ISS-006 | 动态/时间线：comment 列表+作者+时间 | Must | ref4 | ≥2 条 comment，含 agent |
| UI-ISS-007 | @mention pill + 队长 comment | Must | ref5 | 时间线含可识别 mention |
| UI-ISS-008 | 「+ 添加子 issue」链接 | Should | ref3 | 可见可点（mock） |
| UI-ISS-009 | 「展开更早 N 条动态」 | Should | ref5 | 链接可见 |
| UI-ISS-010 | 底部「留下评论…」输入框 | Must | ref5 | 评论输入区可见 |
| UI-ISS-011 | 五列看板：待规划/待办/进行中/审核中/已完成 | Must | ref7 | 5 列同屏 |
| UI-ISS-012 | 列头：色点+名+计数+…+ + | Must | ref7 | 每列头完整 |
| UI-ISS-013 | 空列占位「无 issue」 | Must | ref7 | 待规划/待办可为空 |
| UI-ISS-014 | 筛选 Tab：全部/已分配/我创建的/我的智能体和小队 | Must | ref7 | 4 Tab 可切换 |
| UI-ISS-015 | 头栏「0 工作中」+ 筛选 + 手动 + 看板视图 | Must | ref7 | 右侧工具组可见 |
| UI-ISS-016 | 富卡片：ID+标题+摘要+squad badge+更新时间 | Must | ref7 | FRI-11 卡含产品小队+50分钟 |
| UI-ISS-017 | FRI-11 位于审核中列（seed） | Must | ref7 | 答辩路径锚点 |
| UI-ISS-018 | 卡片拖拽跨列（继承 V1 ISS-002） | Must | V1 | 拖拽仍可用 |
| UI-ISS-019 | 代码块样式（时间线内） | Should | ref4 | bash 代码块可读 |
| UI-ISS-020 | MoSCoW/表格 comment 渲染 | Should | ref4 | 表格不崩版 |
| UI-ISS-021 | 手动创建模态：标题+描述+属性 pills | Must | ref8 | 模态完整字段 |
| UI-ISS-022 | Pills：状态/优先级/指派人/标签/项目 | Must | ref8 | ≥5 pill 类型 |
| UI-ISS-023 | 「切换到智能体」 | Must | ref8 | 按钮可切换到 ref12 模态 |
| UI-ISS-024 | 「继续创建」toggle | Should | ref8 | toggle 可见 |
| UI-ISS-025 | 「创建 Issue」主按钮 | Must | ref8 | 点击 mock 创建 |
| UI-ISS-026 | 智能体创建模态：创建者 squad badge | Must | ref12 | 显示产品小队 |
| UI-ISS-027 | NL 输入框 + placeholder 示例 | Must | ref12 | 大文本区 |
| UI-ISS-028 | 「切换到手动」 | Must | ref12 | 可切到 ref8 |
| UI-ISS-029 | 智能体搜索下拉列表 | Must | ref13 | 输入后显示 agent 列表 |
| UI-ISS-030 | Multica Helper 星标项 | Should | ref13 | 列表首项特殊样式 |
| UI-ISS-031 | 创建 Ctrl+Enter 快捷键提示 | Should | ref12 | 底栏文案 |
| UI-ISS-032 | 模态：展开/关闭按钮 | Must | ref8 | 右上角控件 |

---

## UI-SQD — 小队

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-SQD-001 | 小队列表页 + 计数 | Must | ref9 | 标题「小队 N」 |
| UI-SQD-002 | Tab：我的 / 全部 | Must | ref9 | 2 Tab 可切换 |
| UI-SQD-003 | 表格列：小队/队长/成员/创建者 | Must | ref9 | 4 列 |
| UI-SQD-004 | 预置产品小队行 | Must | ref9 | 队长=策划队长 |
| UI-SQD-005 | + 新建小队 + 筛选 + 排序 | Must | ref9 | 工具按钮可见 |
| UI-SQD-006 | 详情面包屑：小队 > 产品小队 | Must | ref10 | 顶部路径 |
| UI-SQD-007 | 左摘要卡：图标/名/分类/详情字段 | Must | ref10 | leader、成员数、创建者 |
| UI-SQD-008 | Tab：Members / Instructions | Must | ref10 | 2 Tab |
| UI-SQD-009 | 成员卡片：角色/状态/最近活动 | Must | ref10 | ≥4 成员，队长有负责人 badge |
| UI-SQD-010 | 成员 hover：弹出/收藏/删除 | Should | ref10 | PRD 官行可见操作 |
| UI-SQD-011 | + 创建智能体 / + 添加成员 | Must | ref10 | 两按钮 |
| UI-SQD-012 | Instructions：说明+路由表+保存 | Must | ref11 | 含小队编制/派活表 |
| UI-SQD-013 | 归档/删除图标（右上） | Should | ref10 | 红色图标可见 |
| UI-SQD-014 | 成员头像堆叠 +N（列表页） | Must | ref9 | 列表成员列 |
| UI-SQD-015 | 答辩：产品小队 Members 含 4 Agent | Must | ref10 | 与 FRI-11 一致 |

---

## UI-AGT — 智能体

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-AGT-001 | 列表页「智能体 N」+ 说明 + 新建 | Must | ref15 | 页头完整 |
| UI-AGT-002 | Tab：我的/全部/已归档 | Must | ref15 | 3 Tab |
| UI-AGT-003 | 搜索 + 筛选 + 最近活跃排序 | Must | ref15 | 工具栏 |
| UI-AGT-004 | 表格 6 列：智能体/状态/所有者/运行时/最近活跃/运行次数 | Must | ref15 | 列齐全 |
| UI-AGT-005 | 策划队长行：Cursor runtime | Must | ref15 | seed 一致 |
| UI-AGT-006 | 点击行进详情 | Must | ref16 | 路由切换 |
| UI-AGT-007 | 详情左卡：属性（运行时/模型/可见性/并发） | Must | ref16 | 4 属性行 |
| UI-AGT-008 | 详情左卡：SKILLS tags + 添加 | Must | ref16 | ≥5 tags |
| UI-AGT-009 | 8 Tab：动态/Tasks/指令/Skills/环境变量/自定义参数/MCP/集成 | Must | ref16 | Tab 栏 8 项 |
| UI-AGT-010 | 动态 Tab：当前+近30天统计+最近工作 | Must | ref16 | 含 FRI-11 任务 |
| UI-AGT-011 | Skills Tab：列表+描述+删除+添加 | Must | ref17 | ≥3 skill 行 |
| UI-AGT-012 | MCP Tab：JSON 编辑器+清空+保存 | Must | ref18 | 代码区+保存 |
| UI-AGT-013 | 绑定飞书按钮 | Should | ref16 | 可见 |
| UI-AGT-014 | Tasks/指令/环境变量/自定义参数/集成 Tab shell | Must | ref16 | 5 Tab 可点且有占位内容 |
| UI-AGT-015 | 在线状态绿点 | Must | ref16 | 详情头+列表 |
| UI-AGT-016 | 面包屑：智能体 > 名 | Must | ref16 | 顶部 |
| UI-AGT-017 | 新建智能体（继承 V1 AGT-002） | Must | V1 | 仍可创建 |
| UI-AGT-018 | Multica Helper 特殊行 | Should | ref15 | 星标图标 |
| UI-AGT-019 | 最近工作「查看更多」 | Should | ref16 | 链接 |
| UI-AGT-020 | sparkline 活动图 | Should | ref16 | 近30天区 |

---

## UI-SKL — Skills

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-SKL-001 | 页头 Skills N + 副标题 + 新建 | Must | ref1 | 含 count |
| UI-SKL-002 | 搜索 skill + 筛选 + 更新时间排序 | Must | ref1 | 工具栏 |
| UI-SKL-003 | 表格 4 列：名称/已被使用/添加者/更新时间 | Must | ref1 | 列齐全 |
| UI-SKL-004 | 行：skill 名 + 使用 Agent + 添加者头像 | Must | ref1 | ≥5 行 seed |
| UI-SKL-005 | 行 hover：checkbox + … 菜单 | Should | ref1 | web-design-guidelines 行 |
| UI-SKL-006 | URL 导入（继承 V1 SKL-001） | Must | V1 | 新建 skill 流程可达 |

---

## UI-SET — 设置

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-SET-001 | 设置双栏：二级 nav + 内容 | Must | ref2 | 布局 |
| UI-SET-002 | 我的账号 6 项 nav | Must | ref2 | 个人资料~更新 |
| UI-SET-003 | 工作区 6 项 nav | Must | ref2 | 通用~成员 |
| UI-SET-004 | 个人资料：头像+姓名+关于你+计数 | Must | ref2 | 表单完整 |
| UI-SET-005 | 更新资料按钮 | Must | ref2 | 可点 mock 保存 |
| UI-SET-006 | 偏好/通知/API/Daemon 页 shell | Should | ref2 | 可 nav 到占位页 |
| UI-SET-007 | 通用/仓库/GitHub/集成/实验室/成员 shell | Should | ref2 | 可 nav 占位 |
| UI-SET-008 | 二级 nav 选中指示（竖线/高亮） | Must | ref2 | 个人资料选中态 |

---

## UI-RT — 运行时

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-RT-001 | 运行时页双栏：机器列表+详情 | Must | ref14 | 布局 |
| UI-RT-002 | 搜索 machine + Tab All/Online/Errors | Must | ref14 | 筛选栏 |
| UI-RT-003 | 本机 Frisk239 卡片 + Local badge | Must | ref14 | 机器列表 |
| UI-RT-004 | 详情头：在线+版本+daemon id | Must | ref14 | 元信息行 |
| UI-RT-005 | +添加运行时 / +添加电脑 | Must | ref14 | 顶右按钮 |
| UI-RT-006 | 查看日志/重启/停止 | Should | ref14 | 操作按钮组 |
| UI-RT-007 | Runtime 表 5 列 | Must | ref14 | 运行时/健康度/智能体/费用/CLI |
| UI-RT-008 | 行：Claude/Cursor/Opencode mock 数据 | Must | ref14 | 3 行在线 |

---

## UI-WIK — Wiki（毕设增量 · 嵌入 IA）

| REQ ID | 需求陈述 | 优先级 | 截图 | AC 摘要 |
|--------|----------|--------|------|---------|
| UI-WIK-001 | Wiki 使用 Multica 左栏（非独立导航） | Must | V1 | 侧栏 IA 一致 |
| UI-WIK-002 | 主区：树 + 阅读器 | Must | V1 | 5 页 mock |
| UI-WIK-003 | 工作区 nav 可进入 Wiki（第 7 项或 Issues 子入口） | Must | 派生 | 从左栏可达 |
| UI-WIK-004 | 5 页内容保留（V1 WIK-003） | Must | V1 | Home~Glossary |

---

## V2 统计

| 前缀 | Must | Should | 合计 |
|------|------|--------|------|
| UI-NAV | 11 | 2 | 13 |
| UI-CMD | 5 | 0 | 5 |
| UI-ISS | 24 | 8 | 32 |
| UI-SQD | 13 | 2 | 15 |
| UI-AGT | 15 | 5 | 20 |
| UI-SKL | 5 | 1 | 6 |
| UI-SET | 5 | 3 | 8 |
| UI-RT | 6 | 1 | 7 |
| UI-WIK | 4 | 0 | 4 |
| **合计** | **88** | **22** | **110** |

+ **V1 行为回归 32 条**（ISS/SQD/AGT/SKL/NAV/WIK 原前缀）

---

## Won't（V2 仍排除）

- 真实 CLI spawn / runtime 发现 / daemon 心跳
- PostgreSQL / WebSocket / GitHub API 拉取 skill
- 用量页真实计费、飞书真实绑定
- 顶栏多 Tab 真实并行路由（可 mock 单 Tab）
- 项目/自动化深功能（可空壳页）

---

## 模块覆盖对照（原型交付用）

| 截图模块 | REQ 范围 | Must 数 |
|----------|----------|---------|
| 侧栏 IA | UI-NAV-001~012 | 11 |
| 命令面板 | UI-CMD-001~005 | 5 |
| 收件箱 | UI-ISS-001~010 | 8 |
| 五列看板 | UI-ISS-011~018 | 8 |
| 新建 Issue | UI-ISS-021~032 | 10 |
| 小队 | UI-SQD-001~015 | 13 |
| 智能体 | UI-AGT-001~020 | 15 Must |
| Skills | UI-SKL-001~006 | 5 |
| 设置 | UI-SET-001~008 | 5 Must |
| 运行时 | UI-RT-001~008 | 6 Must |
| Wiki | UI-WIK-001~004 | 4 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0 | 2026-07-08 | 产品·需求与PRD官 | 基于 18 张截图增量 |
