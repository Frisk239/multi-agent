# 参考项目借鉴审计 · 抄什么 / 抄了没 / 何时抄

> 更新：2026-07-09 · S03 开片时审计  
> 真源：[`synthesis.md` §3–§4](synthesis.md) · [`references/deep/`](../references/deep/) · 对照 `app/` 实现（S01+S02 已合 main）  
> **用法：** 每个切片的 design spec / writing-plans 必须有一节 **「本切片抄自」**，行内引用本文 ID。

---

## 0. 角色澄清（2026-07-09 用户拍板）

| 项目 | 在本毕设中的角色 |
|---|---|
| **multica** | 编排主骨架：Issue/状态/WS/Squad/Backend 形状 |
| **Pi** | **执行层设计参考**（事件契约、会话抽象、嵌入姿态）；**不**要求 S03 优先做 PiBackend |
| **Claude Code / opencode / Cursor** | **本机 CLI Backend 优先实装**（S03 起） |
| **hermes** | 执行/记忆/扩展哲学：Tool Registry 形状、cache 规则、MemoryProvider、Footprint Ladder |
| **Wiki 系 / mem0 / graphiti** | Phase 2–3，S03 不碰 |

---

## 1. S01 + S02 已抄到位（对照实现）

| ID | 能力 | 主抄自 | 我们落点 | 评价 |
|---|---|---|---|---|
| C-WS | 同步 EventBus → Broadcaster → WS | multica §2c | `orchestration/event-bus.ts` + `ws-broadcaster.ts` | ✅ 正确：无 Redis、单进程 |
| C-ISSUE | Issue 多状态 + CRUD | multica + seed | `schema` + `routes/issues` | ✅ 7 态对齐产品，非 multica 边界 case 全集 |
| C-ASSIGN | 多态 `(type,id)` + label 填充 | multica §1 | assignee 扁平列 + `toIssue` | ✅ |
| C-COMMENT | comment 表 + 多态 author | multica | `comment` 表 + timeline | ✅ 最薄时间线 |
| C-STATUS-TL | 状态变更进时间线 | multica status_change 类 | PUT 事务写 `status_change` | ✅ |
| C-MENTION-UI | mention markdown → pill | 原型 + multica 语法 | `MarkdownBody` + Composer | ✅ 仅渲染，正确留给 S04 触发 |
| C-KANBAN | 看板 + 拖拽改 status | 原型 + multica UX | web Kanban* | ✅ |
| C-DETAIL | 详情 + 评论 | 原型 IA 裁剪 | `/issues/[id]` | ✅ 独立路由非收件箱三栏（有意） |
| C-D11 | 业务短 id | seed 现实 | `BusinessId` | ✅ |
| C-FK | SQLite FK enforce | 工程卫生 | `foreign_keys=ON` | ✅（review 补） |
| C-LOCAL | 固定本地用户 | 纯本地模型 | `LOCAL_MEMBER` | ✅ |

**结论：** S01/S02 把 **编排可演示外壳 + 时间线** 该抄的核心抄到了，没有严重「抄错对象」。

---

## 2. S01/S02 有意未抄（YAGNI，不是漏）

| ID | 能力 | 主抄自 | 为何未做 | 归属 |
|---|---|---|---|---|
| D-LEASE | lease + heartbeat + sweeper | multica 状态机 | 无真实执行、无多 worker | **S03**（真跑任务时必须） |
| D-QUEUE | `agent_task_queue` / claim | multica | 无执行入口 | **S03** |
| D-TRIGGER | comment-trigger / mention 入队 | multica §3 | 只 pill | **S04** |
| D-SQUAD | briefing 三段式 | multica §3 | 无 leader claim | **S04** |
| D-AUTOPILOT | cron/webhook 调度 | multica §4 | 过早 | S06+ / Phase 后 |
| D-INBOX | 收件箱三栏 | 原型 Must | 切片外 | S06+ |
| D-POS | float midpoint 列内排序 | multica | S01 明确 D4 | 体验需要时 |
| D-GUARD | 状态机硬守卫（不可任意互转） | multica | 看板自由拖（D2） | 执行态与人工态分离后再加 |
| D-WIKI | ingest/query | openwiki 等 | Phase 2 | Phase 2 |
| D-MEM | MemoryProvider | hermes/mem0 | Phase 3 | Phase 3 |

---

## 3. 相对「好东西」的缺口（值得在计划里点名）

> 这些不是 S01/S02 必须返工，而是 **S03 起写 plan 时应显式「抄/不抄」**，避免默默漏掉。

### 3.1 编排 / 执行交界（S03 高优先）

| ID | 好东西 | 主抄自 | S01/S02 现状 | 建议 |
|---|---|---|---|---|
| G-BACKEND | `Backend` 接口 + 工厂 switch | multica `pkg/agent` | 无 | **S03 核心**：`RuntimeBackend` + Claude/opencode/Cursor |
| G-DETECT | LookPath + env 覆盖 +（可选）login shell | multica daemon 发现 | 无 | **S03**：`detect()` + GET `/api/runtimes` |
| G-STREAM | 子进程 stream-json → 归一事件 | multica claude backend；**事件形状参考 Pi** `AgentSessionEvent` | 仅 issue/comment 事件 | **S03**：`AgentEvent` → 时间线或并行 progress 通道 |
| G-PROMPT-CACHE | 临时上下文进 user，不污染 system | hermes prompt_caching | 无 | **S03** 组 prompt 时照规则（形状，非抄 Python） |
| G-EXIT | `{final, exit_reason, completed, partial}` | hermes 终止契约 | 无 | **S03** `ExecutionResult` |
| G-ABORT | AbortSignal / 取消运行 | Pi session + multica | 无 | **S03** 详情页「停止」 |
| G-PROGRESS-FF | 进度 fire-and-forget 不进 DB | multica | 我们把 status_change **进了** comment 表 | 工具流式 delta：**WS only**；终态摘要再落 comment（写进 S03 spec） |
| G-TASK-ROW | 任务行 + 条件 claim | multica agent_task | 无 | **S03** 最薄：`run` 表或 issue 上 execution 状态，避免无锁并发双跑 |

### 3.2 产品 / 数据模型（S03 边界）

| ID | 好东西 | 主抄自 | 现状 | 建议 |
|---|---|---|---|---|
| G-ASSIGN-UI | 详情改指派触发执行 | multica + 产品 | assignee **只读** | **S03 必须**放开 agent 指派或「运行」按钮，否则无法验收 |
| G-AGENT-RUNTIME | agent 绑定 runtime 类型 | multica agent 配置 | agent 表仅 name/category | **S03**：agent 上 `runtime` 字段（claude-code / opencode / cursor） |
| G-CWD | 执行 cwd = workspace 路径 | multica/pi | 无 workspace path 配置 | **S03**：workspace 或 env `WORKSPACE_CWD` |
| G-ACTIVITY | activity_log 与 comment 分离 | multica | 全塞 comment.type | 可继续用 type 扩展；工具调用量大时再拆表 |

### 3.3 工程卫生（各切片通用）

| ID | 好东西 | 参考 | 现状 | 建议 |
|---|---|---|---|---|
| G-API-TEST | 路由集成测试 | multica 测试文化 / 我们 S01 计划写 TDD 但执行偏手测 | 几乎无自动测试 | S03 plan 至少：Backend detect 单测 + 一条 execute 录制/假 stdout 测 |
| G-ERR-ENVELOPE | 统一错误 JSON | 各项目 | 手写 `{error}` | shared `ApiError` 可选，非阻塞 |
| G-IDEM | 幂等 POST | multica 唯一索引 | 无 | 执行「开始 run」要幂等（防双点） |

### 3.4 明确后置（别塞进 S03）

| ID | 好东西 | 归属 |
|---|---|---|
| Squad briefing / mention 入队 | S04 |
| Skill URL / MCP 配 agent | S05 |
| Wiki / Memory / AGENTS.md 桥梁 | Phase 2–3 |
| 14 个 CLI 全上 | 永不；先 3 个 |
| hermes 5312 行 loop | 永不自造 |

---

## 4. Pi 怎么「参考着做」而不绑死 PiBackend

写进每个执行相关 spec 的固定段：

1. **事件归一**：对照 Pi `AgentSessionEvent` 定义我们的 `AgentEvent`（message/tool/turn 生命周期），即使底层是 Claude stream-json。  
2. **会话边界**：一次 Issue run ≈ 一次 session；取消 = abort。  
3. **宿主注入**：prompt 组装在编排层（issue 标题/描述/最近 comments），Backend 只负责 execute。  
4. **不抄**：Pi TUI、Pi 作为 S03 必验 Backend。  
5. **可选后续**：若要进程内低延迟路径，再加 `PiBackend implements RuntimeBackend`。

---

## 5. 计划文档模板（S03+ 强制小节）

每个 `docs/superpowers/specs/…-design.md` 与 `plans/…md` 增加：

```markdown
## 本切片抄自（Borrow matrix）

| 能力 | 主抄 | 深读锚点 | 我们落点 | 不抄/延后 |
|---|---|---|---|---|
| … | multica / Pi / hermes / … | deep/xxx.md § | packages/… | … |

### 相对上一切片的缺口回收
- 回收 G-xxx：…
- 明确不回收：…
```

**执行者 handoff** 增加一行：`抄自：G-BACKEND, G-DETECT…`（ID 来自本文）。

---

## 6. S03 建议必抄清单（预填，brainstorm 可改）

| ID | 能力 | 主抄 | 最低验收 |
|---|---|---|---|
| G-BACKEND | RuntimeBackend 接口 | multica + synthesis §2.6 | 三实现类可注册 |
| G-DETECT | 本机探测 | multica LookPath | UI/API 显示 installed |
| G-STREAM | 事件流 | multica stream-json **形状参考 Pi** | 时间线或 WS 见 tool/message |
| G-EXIT | 终止契约 | hermes | run 终态可展示 |
| G-ABORT | 取消 | Pi/multica | 能停 |
| G-ASSIGN-UI 或 Run | 触发执行 | 产品 | 一点就跑 |
| G-AGENT-RUNTIME | agent↔CLI | multica | seed 绑定 runtime |
| G-PROGRESS-FF | 流式不落库 | multica | 防刷爆 comment 表 |
| G-TASK-ROW | 防双跑 | multica claim | 同 issue 单活跃 run |

**S03 Backend 优先序（用户 2026-07-09）：** Claude Code → opencode → Cursor（Pi 仅参考）。

---

## 7. 一句话审计结论

- **S01/S02 没有「该抄编排外壳却抄飞了」的大问题**；multica 的 WS/多态/comment 时间线主路径到位。  
- **真正还没抄、且 S03 不能再拖的**，几乎全在 **执行层**：Backend 抽象、发现、流式事件、任务锁/取消、agent↔runtime 绑定。  
- **Pi** 应作为 **事件与会话设计的教科书**，不是 S03 的必装 CLI。  
- 从 S03 起，计划里固定 **「抄自」表**，避免再靠记忆漏项。
