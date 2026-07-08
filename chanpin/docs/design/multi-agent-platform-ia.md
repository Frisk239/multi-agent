# 信息架构 — Multi-Agent 平台 V2 高保真复刻

**Version:** 2.0  
**Date:** 2026-07-08  
**Author:** 产品·设计·原型官  
**PRD:** [`docs/prd/multi-agent-platform-v2-replica.md`](../prd/multi-agent-platform-v2-replica.md)

---

## 1. 布局骨架（V2）

Multica V2 双区布局：固定侧栏 + 顶栏标签 + 主工作区（无 V1 右栏上下文面板）。

```
┌──────────────┬────────────────────────────────────────────────────┐
│  侧栏 ~220px │  [Tab: 收件箱] [+]              0 工作中           │
│              ├────────────────────────────────────────────────────┤
│  Workspace   │                                                    │
│  搜索 Ctrl+K │              主工作区（按模块切换）                 │
│  新建 issue  │                                                    │
│  ─────────   │  Inbox 三列 | Kanban 五列 | 表格 | 双栏详情 | Wiki  │
│  收件箱      │                                                    │
│  我的 issue  │                                                    │
│  工作区…     │                                                    │
│  配置…       │                                                    │
│  ? Help      │                                                    │
└──────────────┴────────────────────────────────────────────────────┘
```

| 区域 | 宽度 | 职责 |
|------|------|------|
| 侧栏 | 220px | 全局导航、搜索、新建 issue、Help |
| 顶栏 | 40px | 活动标签、+ 新标签、工作中计数 |
| 主区 | flex 1 | 当前模块视图 |

---

## 2. 侧栏信息架构

### 2.1 顶区
- Workspace 名称 + 下拉
- 搜索（Ctrl+K → 命令面板）
- 新建 issue（C → 智能体创建模态）

### 2.2 个人
| 项 | 视图 | 说明 |
|----|------|------|
| 收件箱 | `inbox` | 三列：列表 \| Issue 详情 + 时间线 |
| 我的 issue | `my-issues` | 五列看板 + 筛选 |

### 2.3 工作区
| 项 | 视图 | 说明 |
|----|------|------|
| Issues | `issues` | 工作区五列看板 |
| 项目 | `projects` | Phase 2 占位 |
| 自动化 | `automation` | Phase 2 占位 |
| 智能体 | `agents` → `agent-detail` | 表格 + 双栏详情 8 Tab |
| 小队 | `squads` → `squad-detail` | 表格 + Members/指令 |
| 用量 | `usage` | Phase 2 占位 |
| **Wiki** | `wiki` | 树 + 文章（毕设差异化） |

### 2.4 配置
| 项 | 视图 |
|----|------|
| 运行时 | `runtime` |
| Skills | `skills` |
| 设置 | `settings` |

---

## 3. 页面清单

| 视图 ID | 布局 | 参考截图 |
|---------|------|----------|
| `inbox` | 列表 320px + 详情 flex | ref3,4,5 |
| `my-issues` | 五列 Kanban + 筛选 | ref7 |
| `issues` | 同上 | ref7 |
| `agents` | 表格 | ref15 |
| `agent-detail` | 280px 档案 + 8 Tab | ref16,17,18 |
| `squads` | 表格 | ref9 |
| `squad-detail` | 档案 + Members/指令 | ref10,11 |
| `skills` | 表格 + 搜索 | ref1 |
| `settings` | 二级导航 + 表单 | ref2 |
| `runtime` | 机器列表 + 运行时表 | img_00, ref14 |
| `wiki` | 树 + 阅读区 | V1 延续 |
| `projects/automation/usage` | 居中占位 | — |

---

## 4. 看板五列

| 列 ID | 显示名 | Seed 分布 |
|-------|--------|-----------|
| `planning` | 待规划 | FRI-08, FRI-04 |
| `todo` | 待办 | FRI-07, FRI-05 |
| `in_progress` | 进行中 | FRI-09 |
| `in_review` | 审核中 | **FRI-11** |
| `done` | 已完成 | FRI-10, FRI-06 |

共 8 条 mock Issue；FRI-11 指派产品小队，时间线含 @mention pill。

---

## 5. 模态

| 模态 | 触发 | 参考 |
|------|------|------|
| 命令面板 | Ctrl+K / 侧栏搜索 | ref6 |
| 新建 Issue（智能体） | C / 侧栏按钮 | ref12,13 |
| 新建 Issue（手动） | 模态内切换 | ref8 |

---

## 6. Agent 详情 8 Tab

动态 · Tasks · 指令 · Skills · 环境变量 · 自定义参数 · MCP · 集成

---

## 7. V1 演示路径保留

1. FRI-11 在「审核中」列，指派产品小队
2. 收件箱选中 FRI-11 → 时间线 ≥2 条 + @mention pill
3. 小队详情 → Operating Protocol + Roster（4 成员含队长）
4. Wiki 5 页可点击

---

## 8. Design Tokens

- 背景：`#0a0a0a`
- 面板：`#161616`
- 侧栏宽：220px
- 文件：`prototype/assets/css/tokens.css`

---

## 9. 测试

`prototype/test_v2_paths.py` — Playwright 同步跑通 V2 Must 模块路径。

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-07-08 | MVP 三栏 IA |
| 2.0 | 2026-07-08 | Multica V2 复刻：全侧栏 IA、五列看板、Inbox、Agent/Squad 详情、模态、Runtime |
