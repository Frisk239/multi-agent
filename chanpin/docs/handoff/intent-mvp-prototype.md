# Acceptance Brief: MVP 可交互原型 — Must 路径验收

**Status:** Draft  
**Revision:** 1  
**Prepared for:** 原型队员 3 · 队长 MVP 签核  
**Approval required before risky work:** No — 纯前端 mock，无 prod 数据

## Revision Log

| Rev | Date | Changed criteria | Reason |
| --- | --- | --- | --- |
| 1 | 2026-07-08 | — | 初版 — 从 PRD/RTM 抽离 |

## Goal

林远与王教授能在桌面浏览器（≥1280px）中，通过预置 mock 数据 **点通 4 条 Must 主路径 + 1 条答辩高光路径**，验证 Issue 编排、Squad 委派、Agent/Skill 配置、Wiki 占位与 Multica 三栏布局，且全程无真实 CLI/DB 依赖。

## Scope

**In scope**

- Issue 看板拖拽与详情时间线
- Squad briefing + @mention 委派 UI
- Agent CRUD（内存态）+ runtime/MCP 入口
- Skill URL 导入 + Agent 分配
- 三栏暗色布局 + Wiki 5 页 mock
- 预置 demo seed 数据

**Out of scope**

- 真实 CLI spawn、PostgreSQL、WebSocket
- Wiki ingest、Memory 向量检索
- Autopilot scheduler 实装
- 移动端适配、i18n、auth

## Context

**Discovered facts**

- 交付路径固定为 `D:\code\multi-agent\chanpin\prototype/`
- REQ 前缀 ISS/SQD/AGT/SKL/NAV/WIK，RTM 32 条 Must AC 摘要
- Multica 对标见 `research/multica-feature-matrix.md`

**Product/business constraints**

- 用户：林远（操作）+ 王教授（10 分钟理解）
- Must 边界来自 PRODUCT-BRIEF，禁止扩 scope
- 默认暗色主题；Wiki 5 页；Cursor 仅 runtime 下拉 mock

**Assumptions**

- 原型 tech stack 由队员 3 选型（HTML/CSS/JS 或轻量框架）
- seed 内容可引用 `design/architecture.md` / `synthesis.md` 摘要
- 答辩使用 Chrome/Edge 最新版

**Dependencies**

- PRD: `docs/prd/multi-agent-platform.md`
- RTM: `docs/prd/multi-agent-platform-rtm.md`
- Capability: `docs/product-capability.md`

## Risk Review

| Risk area | Applies? | Required handling |
| --- | --- | --- |
| Security/privacy | No | 无用户数据、无 secret |
| Persistent data/migration | No | mock 内存态；可选 localStorage |
| External effects/cost | No | 无 API 调用 |
| Compatibility/API | No | 无 public API |
| UX/accessibility | Yes | 键盘可达导航项；对比度可读 |

---

## Acceptance Criteria

### 路径 A — Issue 看板（ISS）

#### AC-ISS-01: 看板三列与 seed 分布
- **Scenario:** 首次打开 Issues 页，seed 已加载
- **Action:** 目视看板
- **Expected:** backlog / running / done 三列可见；Issue 总数 6–10；每列 ≥1 卡片
- **Must not:** 空看板或需手动创建 Issue 才能 demo
- **Verification:** 手动计数 + 截图
- **Priority:** Required

#### AC-ISS-02: 拖拽状态流转
- **Scenario:** 某 Issue 在 backlog 列
- **Action:** 拖拽该卡片至 running 列
- **Expected:** 卡片出现在 running；backlog 计数减 1；右栏 status 同步（若该 Issue 选中）
- **Must not:** 页面刷新或 JS 报错
- **Verification:** 手动拖拽 + 控制台无 error
- **Priority:** Required

#### AC-ISS-03: Issue 详情时间线
- **Scenario:** seed Issue 含 ≥2 comment（human + agent 混合）
- **Action:** 点击该 Issue 卡片
- **Expected:** 详情页时间线正序显示 author、正文、时间戳；含 @mention pill 的 comment 可识别
- **Verification:** 手动点击 + 目视
- **Priority:** Required

---

### 路径 B — Squad 委派（SQD）— 答辩高光

#### AC-SQD-01: 预置产品小队
- **Scenario:** 首次加载
- **Action:** 打开 Squad 上下文（Issue assignee 或 Squad 视图）
- **Expected:** 「产品小队」存在；leader 为策划队长 Agent；成员 ≥2（含调研 Agent）
- **Verification:** seed 检查 + 目视
- **Priority:** Required

#### AC-SQD-02: Issue 指派 Squad 展示 briefing
- **Scenario:** Issue 详情页
- **Action:** assignee 下拉选择「产品小队」
- **Expected:** 右栏出现 briefing 摘要，含 Operating Protocol + Roster + 指令三段结构
- **Verification:** 下拉 + 目视右栏
- **Priority:** Required

#### AC-SQD-03: 队长 @mention 委派闭环
- **Scenario:** 预置 Issue 时间线含队长 comment
- **Action:** 按 demo script 浏览：Issue → 指派 Squad → 查看队长 comment → 识别 @调研 Agent
- **Expected:** @mention 渲染为 pill；语义上可理解为「委派给调研 Agent」；全程 ≤3 分钟无 dead-end
- **Must not:** 触发真实 Agent enqueue 或网络请求
- **Verification:** 计时 demo + 控制台 Network 无 POST 到 agent API
- **Priority:** Required

---

### 路径 C — Agent + Skill（AGT + SKL）

#### AC-AGT-01: 创建 Agent 并选 runtime
- **Scenario:** Agents 页
- **Action:** 新建 Agent，填名称与 instructions，runtime 选 Cursor，保存
- **Expected:** 列表出现新 Agent；runtime 显示 Cursor（mock，不 spawn）
- **Verification:** 表单操作
- **Priority:** Required

#### AC-AGT-02: MCP 配置入口可见
- **Scenario:** 任一 Agent 详情
- **Action:** 滚动至 MCP 区
- **Expected:** 空 servers 列表 + 添加按钮可见
- **Verification:** 目视
- **Priority:** Required

#### AC-SKL-01: URL 导入 Skill
- **Scenario:** Skills 页，列表已有 seed skills
- **Action:** 输入 `https://github.com/example/skill-repo` 并点导入
- **Expected:** 列表新增 1 条，显示名称与 URL
- **Must not:** 发起真实 GitHub API 请求（可 mock）
- **Verification:** 手动 + Network 面板
- **Priority:** Required

#### AC-SKL-02: Skill 分配给 Agent
- **Scenario:** Agent 编辑页
- **Action:** 勾选 ≥1 skill 并保存
- **Expected:** Agent 详情显示已分配 skill 名称
- **Verification:** checkbox 操作
- **Priority:** Required

---

### 路径 D — 布局与 Wiki（NAV + WIK）

#### AC-NAV-01: 三栏暗色布局
- **Scenario:** 1280×800 视口
- **Action:** 加载任意主页面
- **Expected:** 左栏导航 ~240px、主区 flex、右栏 ~320px 同屏；默认暗色背景
- **Verification:** 目视 + DevTools 宽度
- **Priority:** Required

#### AC-NAV-02: 左栏导航切换
- **Scenario:** 应用已加载
- **Action:** 依次点击 Issues / Agents / Skills / Wiki
- **Expected:** 主区切换对应视图，无整页白屏 reload
- **Verification:** 点击四项
- **Priority:** Required

#### AC-WIK-01: Wiki 五页可读
- **Scenario:** Wiki 页
- **Action:** 树中依次点击 Home、Architecture、Synthesis、Sprint Log、Glossary
- **Expected:** 每页主区渲染非空 mock 内容（标题 + 正文）
- **Verification:** 遍历 5 节点
- **Priority:** Required

---

### 路径 E — 导师 10 分钟理解（US-DEMO-01）

#### AC-DEMO-01: 端到端 demo 可完成
- **Scenario:** 王教授视角，仅 PRD 摘要 + 原型
- **Action:** 按 `demo-script` 完成：①看板拖 card ②Issue 时间线 ③创建 Agent+导入 Skill ④Squad 指派+@mention ⑤Wiki 浏览 1 页
- **Expected:** 5 步均可完成；可口头复述「Multica 编排 + Wiki 占位」差异化
- **Verification:** 队长/用户计时 ≤10 分钟
- **Priority:** Required

---

## Blocking Decisions

- [x] 暗色主题默认 — 已决
- [x] Wiki 5 页 — 已决
- [x] Cursor runtime UI mock — 已决
- [ ] 原型 tech stack — 队员 3 自决，不阻塞

## Verification Plan

| Criterion | Evidence | Status |
| --- | --- | --- |
| AC-ISS-01..03 | 手动 QA checklist | Pending |
| AC-SQD-01..03 | 3 分钟 demo 录像或队长目击 | Pending |
| AC-AGT-01..02 | 表单截图 | Pending |
| AC-SKL-01..02 | 列表截图 | Pending |
| AC-NAV-01..02 | 1280px 截图 | Pending |
| AC-WIK-01 | 5 页遍历 | Pending |
| AC-DEMO-01 | 10 分钟 walkthrough | Pending |

## Demo Script（答辩用）

```
1. [ISS] 打开 Issues 看板 → 指出 6–10 张卡片与三列
2. [ISS] 拖拽 FRI-11 至 running → 点开详情看时间线
3. [SQD] assignee 选「产品小队」→ 右栏 briefing → 时间线队长 @调研 Agent
4. [AGT+SKL] Agents 页 → 新建 Agent → Skills 导入 URL → 分配给 Agent
5. [WIK] Wiki → Architecture 页 → 指「知识层占位，Phase 2 ingest」
6. [差异化] 「Multica 管编排，我们加 Wiki+Memory 入口，MVP mock 证明 UX」
```

---

## Won't 回归检查（必须通过）

| 检查 | 方法 |
|------|------|
| 无 CLI spawn | 任务管理器无新 node/python 子进程 |
| 无 DB 连接 | Network 无 postgres/socket 连接 |
| 无 scope creep | RTM Won't 列功能不可点通 |
