# 垂直切片划分

> 更新：2026-07-08 · brainstorm 产出 · 配套 [roadmap.md](roadmap.md)（Phase 视角）、[synthesis.md](synthesis.md)（技术选型）
> 工程模式见 [AGENTS.md](../AGENTS.md) §工程模式

## 切法原则

1. **每片端到端可跑**——做完浏览器里能看到新东西，不是攒到最后集成
2. **FRI-11 答辩路径渐进度过**——每片都让 demo 路径更完整一点
3. **不按工作量切，按"做完看到什么"切**——一个切片可大可小，由它的验收画面定义边界
4. **S01 细化到可执行，后续切片只占位**——做到时各自起会话细化
5. **一切片一 feature 分支，不直接进 main**

---

## 切片清单

### S01 — 看板 + WebSocket（待启动）

**覆盖：**
- pnpm workspace monorepo（server / web / shared 三包互能 import）
- shared 包：Zod schema（照 [seed.js](../chanpin/prototype/data/seed.js) 结构定义 Issue / Agent / Squad / Skill / Comment）
- Drizzle schema + SQLite migration + seed 脚本
- server：Issue CRUD API（GET / POST / PATCH status）
- web：五列看板视图 + 卡片 + 拖拽 + 新建
- 状态机最薄版（条件 UPDATE，**不含** lease/sweeper）
- WebSocket 实时推送（issue:created / issue:updated）

**验收画面（浏览器里能看到的）：**
- `pnpm dev` 起 server + web
- 五列看板，卡片从 SQLite 真实读取（FRI-04~FRI-11，FRI-11 在「审核中」列）
- 点「新建 issue」→ 填标题 → 提交 → 看板**实时刷新**（WS 推 issue:created）
- 拖拽卡片到「进行中」→ DB 条件更新 → WS 推 issue:updated → 客户端同步
- **开两个浏览器窗口，一个拖卡片，另一个实时看到移动**

**不包含：** Issue 详情/时间线、评论、Squad、收件箱、真实 agent 执行、运行时发现

**答辩路径点亮：** 看板部分

**下一步：** 起一个计划者会话，读本文档 + AGENTS.md + synthesis.md，产出 S01 spec（执行者拆分 + 详细验收标准），存 `app/.progress/s01-planner-1.md`

---

### S02 — Issue 详情 + 时间线 + 评论（占位）

**覆盖：** Issue 详情页 + 时间线 + 评论 CRUD + @mention pill 渲染

**验收画面（一句话）：** 点卡片进详情，看到描述 + comment 列表，能发评论，@mention 渲染成 pill

**答辩路径点亮：** 时间线部分

**细化时机：** S01 合并后起会话

---

### S03 — 执行层：真实 agent 接入（占位）

**覆盖：** RuntimeBackend 接口 + PiBackend + ClaudeCodeBackend + 运行时发现 + 执行事件流接入时间线

**验收画面（一句话）：** Issue 指派给 agent → 真实 Pi/Claude 执行 → 时间线显示工具调用和产出；运行时页显示本机探测到的 CLI

**答辩路径点亮：** 真实执行（替代 mock）

**注意：** 不做 MockBackend——直接上真实 Backend。参考 [synthesis.md §2.6](synthesis.md) 的 `RuntimeBackend` 接口 + [deep/multica.md](../references/deep/multica.md) §5 的 Backend 抽象 + [deep/pi.md](../references/deep/pi.md) §5 的 SDK 嵌入

**细化时机：** S02 合并后起会话

---

### S04 — Squad 小队（占位）★★★★★

**覆盖：** Squad CRUD + 成员管理 + briefing 注入 + mention-trigger 路由

**验收画面（一句话）：** 指派给小队 → leader claim 时注入 briefing（Operating Protocol + Roster + Directive）→ @mention 委派 → 被委派 agent 队列入任务

**答辩路径点亮：** ★★★★★ 小队核心体验

**参考：** [deep/multica.md](../references/deep/multica.md) §3（三段式 briefing + mention 闭环）

**细化时机：** S03 合并后起会话

---

### S05 — Skill + MCP（占位）

**覆盖：** Skill URL 导入 + 按 agent 分配 + MCP 配置

**验收画面（一句话）：** agent 详情 Skills Tab 可导入/分配 skill；MCP Tab 可配 MCP server 并连接

**答辩路径点亮：** Skill 导入 + MCP 支持

**参考：** seed.js 的 skills[] 数据结构 + [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §3 Footprint Ladder

**细化时机：** S04 合并后起会话

---

### S06+ — 待定（占位）

后续切片候选（做到时起会话定）：
- 收件箱三栏（列表 + 详情 + 时间线一体）
- 新建 Issue 双模态（智能体/手动）
- 智能体列表 + 详情 8 Tab
- 运行时页（机器列表 + Runtime 表格）
- 命令面板 Ctrl+K
- 设置二级导航

---

### 后续 Phase（占位）

| Phase | 覆盖 | 细化时机 |
|---|---|---|
| **Phase 2 — Wiki** | Wiki 存储 + ingest 管线 + query/lint/health + 浏览器 UI + AGENTS.md 桥梁 | Phase 1 合并后 |
| **Phase 3 — 记忆** | MemoryProvider ABC + mem0 向量 + brain-first 协议 + graphiti 可选实验 | Phase 2 合并后 |
| **Phase 4 — 打磨** | 端到端 demo + 性能数据 + 答辩材料 | Phase 3 合并后 |

---

## 答辩路径进度追踪

FRI-11 路径随切片渐进点亮：

| 切片 | 点亮的部分 | 状态 |
|---|---|---|
| S01 | 看板显示 FRI-11 | ⬜ |
| S02 | 时间线 + 评论 | ⬜ |
| S03 | 真实 agent 执行 | ⬜ |
| S04 | 小队 briefing + @mention 委派 | ⬜ |
| S05 | Skill + MCP | ⬜ |

**全路径：** 看板建 Issue 指派小队 → 队长 claim 读 briefing → @mention 委派队员 → 队员执行 → 时间线汇报 → 完成
