# Multica 对照差距表 · 滚动（2026-07-24）

> 目标：**本地版 Multica 控制台体验**（日常可用），**非** daemon/云协议 1:1。  
> HEAD 随 main 滚动；细 commit 列表见 git log / 各 `*-impl-*.md`。  
> **2026-07-24 全量审计：** [gap-analysis-2026-07-24.md](./gap-analysis-2026-07-24.md)

## 已对齐（主航道 · ~90% 日用覆盖）

| 路径 | 状态 | 代表切片 |
|---|---|---|
| 看板 / Issue / 指派 / 标签 / 筛选深链 / 子 issue / 订阅 / PR URL | ✅ | S01–S02 · G1–G6 |
| 多 Backend 执行 + model 绑定 + thinking level + run 列表/轨迹 | ✅ | S03 · G22 · DS4 |
| 小队 leader + briefing + mention + 委派链路可视化 | ✅ | S04 · Phase2 Slice B |
| Chat 多轮 history + 项目绑定 + 隔离 cwd + Helper FAB | ✅ | F2 · B1 · G9–G11 |
| Wiki 编译 / query / dead 重试 / per-project 根 | ✅ | S06–S08 · DS3 · ADR 0005 |
| Memory 双后端 + 列表/搜索/批量删除 + 运行自动沉淀 | ✅ | S09–S11 · Phase2 Slice C |
| Inbox 三栏详情 + DM 追问 + 归档 + kind 筛选 | ✅ | bu01 · G7–G8 · G21 |
| Agent readiness / 工作仪表盘 / 能力 Tab / 运营恢复链 | ✅ | bu02 · G12–G14 |
| Quick-create / Automation + 模板画廊 | ✅ | bu03 · bu05 · G15 |
| Settings 诊断 + cwd 持久化 + 健康卡 + Live 探针 | ✅ | bu04 · Phase2 Slice D |
| Run 收尸 / 批量取消 / 健康阈值 | ✅ | runs-recover-stuck · runs-bulk-cancel |
| Project 容器 + localPath + Git dirty 探针 + cwd 路由 | ✅ | G16 · Phase1 Slice 3 |
| UX Trust A–D (cwd 诚实 / 旁路同闸 / 韧性 / 手感) | ✅ | Wave A–D |
| PriorWorkDir + Session 继承 (rerun) | ✅ | Phase1 Slice 4 |
| Issue 列表视图 (GAP-03) + 表头排序 | ✅ | Slice 1 (`slice1-listview-impl-1.md`) |
| Activity Log 结构化时间线 (GAP-01) | ✅ | Slice 2 (`slice2-activitylog-impl-1.md`) |
| Agent 30 天统计仪表盘 + 构成条 (GAP-04) | ✅ | Slice 3 (`slice3-agentstats-impl-1.md`) |
| Memory 自动检索注入 Prompt (GAP-09) | ✅ | Slice 4 (`slice4-memoryinject-impl-1.md`) |
| Onboarding 首启向导 (GAP-02) | ✅ | Slice 5 (`slice5-onboarding-impl-1.md`) |
| RuntimeEvent 统一事件协议 (GAP-10) | ✅ | Slice 6 (`slice6-runtimeevent-impl-1.md`) |

## 体验可演进（Phase C 已收官 · 2026-07-27）

> **Phase C 整队：** [queue-44-54-phase-c-closeout-2026-07-27.md](./queue-44-54-phase-c-closeout-2026-07-27.md)（Slice **44–54 ✅**）  
> 计划（只读）：[slice-plan-2026-07-27-phase-c.md](./slice-plan-2026-07-27-phase-c.md)  
> Phase B：[slice-plan-2026-07-27-phase-b.md](./slice-plan-2026-07-27-phase-b.md) · [queue-23-43-phase-b-closeout-2026-07-27.md](./queue-23-43-phase-b-closeout-2026-07-27.md)

| 波次 | 切片 | 主题 | 状态 |
|---|---|---|---|
| **H 诚实** | 44 / 47 | 假成功 Backend · Wiki running lease | ✅ |
| **U 手感** | 45–46 / 48 / 52–54 | 草稿 · live · Confirm · Select · 键/窄屏 · chips | ✅ |
| **S 安全/Resume** | 49–50 | 本地 token · Resume 矩阵 | ✅ |
| **O 运维** | 51 | Ops snapshot + live-probes | ✅ |

**▶ Phase D 已收官：** [queue-55-62-phase-d-closeout-2026-07-27.md](./queue-55-62-phase-d-closeout-2026-07-27.md)（Slice **55–62 ✅**）  
**▶ Phase E 已收官：** [queue-63-70-phase-e-closeout-2026-07-27.md](./queue-63-70-phase-e-closeout-2026-07-27.md)（Slice **63–70 ✅** · 失败可解释 + 恢复纵深）  
**▶ Phase F 主路径已收官：** [queue-71-73-phase-f-closeout-2026-07-27.md](./queue-71-73-phase-f-closeout-2026-07-27.md)（Slice **71–73 ✅** · Activity 活数据 · 合并故事线 · 流式 partial/折叠）  
计划（只读）：[slice-plan-2026-07-27-phase-f.md](./slice-plan-2026-07-27-phase-f.md) · **74 Tool 只读面板可选未开**

| 波次 | 切片 | 主题 | 状态 |
|---|---|---|---|
| **F 故事线/活数据** | 71 | Activity RQ + `activity:created` WS | ✅ |
| | 72 | Issue 客户端合并故事线（默认 tab） | ✅ |
| | 73 | Run partial + denser pair + stick-bottom | ✅ |
| | 74 | Tool 事件只读面板 | ⏸ 可选 |

## 刻意不做（非债 · 勿当完成态 blocker）

| 边界 | 原因 |
|---|---|
| Wiki LLM / embedding 密钥写 DB/UI | 安全；env-only（宪法） |
| 云 webhook / 多租户 / Redis | 纯本地宪法 |
| Multica daemon 协议 1:1 | Backend adapter 学接口不学进程模型 |
| 密钥入库 / UI 写密钥 | ADR 0003 |
| 大规模生产运营 BI | 非本产品阶段 |
| TipTap 全量 / Wiki 图谱优先 | Phase C 薄版 chips；图谱低频 |
| 后端强制 storyline merge API | 客户端 merge 已够（Phase F） |

## 达标判断

| 维度 | 判断 |
|---|---|
| **主航道日常可用** | **是** |
| **本地 Multica 控制台完成态** | **是（体验边界内）** — 派活→执行→观测→恢复→Wiki/Memory→Settings 可闭环；Issue 故事线 + Activity 活数据 + Run partial 已加深 |
| **Multica 源码级克隆完成态** | **否（刻意）** |

**继续策略：** Phase F 主路径 71–73 已收官；可选开 74 Tool 面板，或 gap 审计 / 新阶段选题。勿把 7/26 全量表当未开工清单。
