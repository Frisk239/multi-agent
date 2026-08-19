# G8 可信执行 — 切片计划（计划者包）

> **日期：** 2026-08-10  
> **角色：** 计划者（本会话）→ 人粘贴 kickoff 给执行者 → 计划者后续验收  
> **依据：** 四路子代理分析（后端 / 前端 / references / 可靠安全）+ `hard-gap-audit-2026-08-08.md`  
> **前提：** G1–G7 与 08-08 硬缺口主波已收；**不重开已闭环项**

## 1. 目标陈述

**G8 · 可信执行（Trust）：** 控制台声明与真实世界一致——  
崩溃后 CLI 可 reconcile；旧密钥不长期躺在 SQLite；派活前知道「装了 ≠ 能跑」；看板路径锁等待可见；transcript 不无意落密钥。

**刻意不做（禁区）：** 云/webhook/Redis/daemon 1:1 · 自造 agent loop · 密钥入库 UI · TipTap 全量 · Wiki 图谱大屏 · 默认拆 path-lock 串行 · 盲杀可复用 PID

## 2. 切片总表（建议执行顺序）

| 序 | ID | 标题 | 厚度 | 依赖 | 并行 | 状态 |
|---|---|---|---|---|---|---|
| 1 | **G8-1** | 看板 `waiting_local_directory` 活性闭环 | 小 · 前端 | — | 可与 G8-2 并行 | ✅ 计划者验收 2026-08-10 |
| 2 | **G8-2** | 崩溃后 CLI execution ownership | 中 · 后端 | — | 可与 G8-1 并行 | 🟡 实现与验证通过 2026-08-17，待审查/提交 |
| 3 | **G8-3** | 旧密钥清库 + envRef 缺值 fail-closed + 备份诚实 | 中 · 后端 | — | 建议 G8-2 后或并行 | ✅ Owner 验收 2026-08-17，待独立提交 |
| 4 | **G8-4** | Runtime preflight + 派活前 readiness 分层 + capability UI 默认 fail-closed | 中 · 全栈 | 建议 G8-1 后 | 串行优先 | ✅ Owner 验收 2026-08-17，待独立提交 |
| 5 | **G8-5** | Transcript / 日志密钥 scrub | 中 · 后端 | 建议 G8-3 后 | — | ✅ Owner 验收 2026-08-17，待独立提交 |
| 6 | **G8-6** | 长轨迹锚定 + Subagent 树错误显式 + 极小文案（08-19 加厚：Sheet 尾窗 + 就地再执行 + beforeSeq） | 中 · 全栈 | 可独立 | 可与 G8-5 并行 | ✅ Owner 路径验收 2026-08-19，待独立提交 |

**可选二期（本包只给 kickoff，默认不排主队列）：**

| ID | 标题 | 何时开 |
|---|---|---|
| G9-1 | Builtin 方法论 skill pack（gstack 风格 Markdown） | 要「感知差异」且零 runtime 风险时 |
| G9-2 | 代码仓增量 Wiki（openwiki 风格 git noop） | 多 project + localPath 日用时 |
| G10-1 | opt-in Git worktree 并行 | **人点头** 吞吐战略后 |

## 3. 切片规格摘要

### G8-1 · 看板 waiting 活性
- **Must：** `useWorkspaceRuns({ status: 'waiting_local_directory' })`；并入 `activeIssueIds`；卡面可见「等目录」类状态；WS 到后无需整页刷新。  
- **Out：** worktree 并行、改 path-lock 语义。  
- **验收：** 同 project 双 run → 第二张卡有 waiting 活性；既有 running/queued 脉冲不回归。

### G8-2 · Execution ownership
- **Must：** 持久化 run↔pid↔启动指纹（表或侧车）；启动 reconcile：能确认则 kill tree + failed；不能确认 → `unknown_external_execution` + 可观测提示，**禁止 PID 盲杀**。  
- **Out：** 多节点 lease、云、Redis。  
- **验收：** 单测/fixture 覆盖「可确认杀」与「不可信不杀」；orphan 文案可区分。

### G8-3 · 密钥清库 + envRef
- **Must：** 扫描旧 `env_vars`/`mcp_servers` 敏感明文（dry-run + apply）；敏感 envRef 未解析 → run fail-closed 明确文案；备份元数据注明历史明文风险或提供 scrub 备份说明。  
- **Out：** 云 vault、UI 回填 secret。  
- **验收：** 旧行清理后 strings 无 secret；缺 env 的 run 失败原因可读。

### G8-4 · Preflight + UI 诚实
- **Must：** adapter 可选无副作用 `preflight`；readiness/live-probes 分层（installed / preflight_ok|fail / unverified）；MCP Tab 默认 `supportsMcpConfig=false` 直至 catalog 确认；customArgs 按 capability 门；指派路径 unverified 黄提示。  
- **Out：** 交互式 login UI、写项目文件的探测。  
- **验收：** mock preflight fail 时 UI 可见；catalog 加载中不闪 MCP；typecheck + 相关测绿。

### G8-5 · Transcript scrub
- **Must：** 消息落库与 WS 推送前对高置信 secret pattern 脱敏；与 stream-scrubber 并列。  
- **Out：** 通用 PII 全量、改产品文案体系。  
- **验收：** 注入假 secret 后 DB/API 为 redacted；分页路径无性能回归。

### G8-6 · 长轨迹体验
- **Must：** 默认锚定最新；load-more 文案「更早」；Subagent 树 `isError` → ErrorState/重试；Sheet「Rich Text」→「Markdown · 附件」。  
- **Out：** TipTap、Multica 全量 transcript dialog。  
- **验收：** >500 消息路径文案正确；树失败可见。

## 4. 计划者职责（你之后找我）

1. 人把执行者回报贴回 → 对照本节 Must/验收勾选  
2. 抽查：相关测试命令、关键路径、是否踩禁区  
3. 关刀记录建议写 `app/.progress/g8-*-closeout-*.md`；可选回写 `design/roadmap.md` 注册 G8  
4. 下一刀 kickoff 是否需微调（依赖失败时）

## 5. Kickoff 文件

| Slice | 粘贴文件 |
|---|---|
| G8-1 | [kickoffs/G8-1-board-waiting.md](./kickoffs/G8-1-board-waiting.md) |
| G8-2 | [kickoffs/G8-2-execution-ownership.md](./kickoffs/G8-2-execution-ownership.md) |
| G8-3 | [kickoffs/G8-3-secret-cleanup.md](./kickoffs/G8-3-secret-cleanup.md) |
| G8-4 | [kickoffs/G8-4-preflight-readiness.md](./kickoffs/G8-4-preflight-readiness.md) |
| G8-5 | [kickoffs/G8-5-transcript-scrub.md](./kickoffs/G8-5-transcript-scrub.md) |
| G8-6 | [kickoffs/G8-6-transcript-ux.md](./kickoffs/G8-6-transcript-ux.md) |
| G9-1 可选 | [kickoffs/G9-1-skill-pack.md](./kickoffs/G9-1-skill-pack.md) |

**推荐并行策略：**  
- Session A：G8-1 → G8-6（前端）  
- Session B：G8-2 → G8-3 → G8-5（后端安全可靠）  
- Session C：G8-4（全栈，等 B 的 readiness 字段不冲突即可；可与 A 尾并行）
