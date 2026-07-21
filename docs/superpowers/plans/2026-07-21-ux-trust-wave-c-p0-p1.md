# UX Trust Wave C + D — P0/P1 Implementation Plan

> **For agentic workers:** Slice Owner · main 直推（`AGENTS.md` / ADR 0001）· 每刀 Playwright + `app/.progress/*-impl-1.md`。  
> **Phase 真源：** `app/.progress/phase-multica-ux-trust-2026-07-21.md`  
> **来源：** 2026-07-21 体验缺口分析（P0/P1）· Multica `local_directory` / Idle+ToolWatchdog / PriorWorkDir

**Goal:** 从「派活诚实（A/B ✅）」推进到「**敢绑真仓并跑、敢长跑、对话与执行过程可感**」。

**Architecture 原则：**

1. 学 Multica **语义**，不移植 daemon 全状态机。  
2. 同 path 安全 > 流式观感 > skills 运营 > 冷启动 resume。  
3. 默认隔离目录 **不**加 path 锁；仅 `cwd_mode === project_local`（真仓）串行。  
4. 密钥 / daemon 多机 / Wiki 分根大迁移 **不在本计划**。

**Tech Stack:** `@ma/shared` + Fastify server + Next.js web · Drizzle/SQLite · React Query · WS eventBus · Playwright。

**默认开干顺序：**

```
C1 → C2 → C3 → D1 → D2 → D3
```

人可改序；**C1 不得跳过**（真仓双写风险）。

---

## 0.  backlog 总表（本计划范围）

| ID | 波 | 优先级 | 切片 | 用户可感一句话 | Demoable |
|---|---|---|---|---|---|
| **C1** | C | **P0** | 同 localPath 简易串行 | 两 run 同真仓 → 后到的排队/等待，不双写 | Y |
| **C2** | C | **P0** | Tool-aware idle / ToolWatchdog | 长构建有 tool 不误杀；真卡死 2h 人话失败 | Y |
| **C3** | C | **P1** | Skills 按 project 运营 | 导入/列表可对 `project.localPath/.skills`；无 workspace 不挡用户级 | Y |
| **D1** | D | **P1** | Chat 流式气泡 | 思考中可见增量文本 / 工具名，不只一行 progress | Y |
| **D2** | D | **P1** | 隔离 workdir 复用叙事 | Issue 再执行 / 同 issue 明示「沿用隔离目录」；可选清理入口 | Y |
| **D3** | D | **P1** | Run tool 叙事加厚 | Runs/Issue 轨迹 tool 摘要更易扫；opencode 流解析不更差 | 部分 |

**明确不进本计划（P2 / 二期）：** 首启 3 步向导、看板列表视图、通知偏好 UI、Wiki per-project 根、CLI session 真 resume、用量真 token。

---

## 1. 已有能力（勿重复造）

| 能力 | 位置 |
|---|---|
| `project.localPath` + resolve `project_local` | `resolve-run-cwd.ts` · `run-worker.ts` |
| Run 落库 `cwdPath` / `cwdMode` | schema + A2 |
| Issue idle 30m（事件 touch heartbeat） | `stale-runs.ts` · `run-worker onEvent` |
| `tool_start` / `tool_end` / `message_delta` 事件类型 | `runtime/types.ts` · claude/cursor 解析 |
| Chat 多轮 history + 绑 project | `prompt.ts` · B1 |
| Skills 读侧：project_local 优先仓内 `.skills` | `skill/scanner.ts` · `prompt.ts` F6 |
| RunEventTimeline UI 壳 | `RunEventTimeline.tsx` |
| Enqueue 硬闸 / skip reason | Wave A/B |

---

## 2. Multica 对照（实现时只留摘要）

| 主题 | Multica | 本仓本计划做法 |
|---|---|---|
| Path 锁 | `local_directory.go` path mutex + `waiting_local_directory` | **DB 查 active run 同 `cwd_path`**；后到者保持 `queued` 或标记等待原因；**不**新状态机除非必要 |
| Idle | `DefaultAgentIdleWatchdog=30m` | 保持；**tool in-flight 时改用 tool 窗口** |
| Tool | `DefaultAgentToolWatchdog=2h` | `MA_ISSUE_TOOL_IDLE_MS` 默认 2h；`tool_start` 未配对 `tool_end` 时用此阈值 |
| Workdir | PriorWorkDir + Reuse | Issue 隔离路径已按 issueId 稳定 → **UI/文案诚实** + 可选清理；不做 CLI session resume |
| Chat 流 | daemon transcript 推送 | 吃现有 `run:progress` / `run:message` → Chat 气泡增量 |

---

## File map（跨刀）

| 区域 | 文件 |
|---|---|
| Path 锁 | `orchestration/path-lock.ts`（新）· `run-service.ts` / `run-worker.ts` · 可选 `stale-runs` |
| 状态/原因 | `shared/schema.ts` · `db/schema.ts`（若加 `wait_reason` 列）· reshape |
| Idle/tool | `stale-runs.ts` · `run-worker.ts` · 可选 run 表 `tool_inflight` / 内存 Map |
| Skills | `skill/scanner.ts` · `skill/import-url.ts` · `routes/skills.ts` · `SkillsPage` / import dialog |
| Chat 流式 | `ChatPage.tsx` · `lib/ws.ts` / api hooks · 可选 `run:progress` 聚合 |
| Workdir 叙事 | `RunDetailPage` · `IssueRunHistory` · `resolve-run-cwd` 只读辅助 · Settings 可选 GC |
| 关刀 | `app/.progress/ux-trust-cN-*-impl-1.md` · `ux-trust-dN-*-impl-1.md` |
| 阶段 | `phase-multica-ux-trust-2026-07-21.md` · `CONTEXT.md` |

---

# Wave C — 多仓韧性

## Task C1: 同 localPath 简易串行（P0）

**Demo:**  
1) Project 绑 `D:/tmp/foo`；Issue A 指派 agent 跑起来（running + `cwd_mode=project_local`）。  
2) Issue B（同 project）再指派 → **不立刻第二 CLI 写盘**；UI 见排队/「等待本机目录」类提示。  
3) A 结束后 B 自动或下一轮 claim 开工。  
4) 两个 **隔离** issue（无 project）可并行。

**设计拍板（默认）：**

| 项 | 选择 |
|---|---|
| 锁键 | 规范化绝对路径 `normalizeProjectLocalPath` 后的 string |
| 谁占锁 | `status IN ('running')` 且 `cwd_mode='project_local'` 且 `cwd_path` 相等（大小写：Win 上 lower） |
| 后到 run | **允许 insert queued**；worker **claim 前**若 path 被占 → **跳过本轮 claim**（仍 queued）或 set `waitReason=path_busy` 供 UI；**不要**静默 fail |
| Chat/QC | 同规则：`project_local` 才锁；scratch/isolated **不锁** |
| Leader/squad | 同 path 仍串行（本地单机安全优先；Multica leader 不绑 local_dir 可后续优化） |
| 不做什么 | 完整 `waiting_local_directory` 状态枚举、跨进程文件锁、分布式锁 |

**Files:**

- Create: `app/packages/server/src/orchestration/path-lock.ts`
  - `normalizePathLockKey(path: string): string`
  - `findActiveRunHoldingPath(path: string, excludeRunId?: string): { id, issueId } | null`
  - `isPathFreeForRun(runId, path, mode): boolean`
- Modify: `run-worker.ts` — claim/execute 前：若 `mode===project_local` 且 path 被占 → **return 不 execute**（保持 queued，touch 可选 `last_blocked_at` 防饿死日志）
- Modify: 可选 `run-service` list 或 run reshape 暴露 `blockedByRunId` / `waitReason`（若不想加列：API 计算「同 path 的 running 先驱」）
- Modify: `RunsPage` / `RunDetailPage` / Issue 活迹 — running 占锁时显示「占用本机目录」；queued 显示「等待：目录被 run xxx 占用」
- Progress: `app/.progress/ux-trust-c1-path-serial-impl-1.md`

**实现步骤（checkbox）：**

- [x] Step 1: `path-lock.ts` + 单测/脚本：同 path running 检测；Win 路径 lower+normalize
- [x] Step 2: `run-worker` claim 前 gate；被挡 WS `run:progress`「等待本机目录…」
- [x] Step 3: 列表/详情 UI 展示占用关系（API enrich）
- [x] Step 4: `scripts/test-path-serial-c1.mts` ALL PASS
- [x] Step 5: typecheck + progress + 更新 phase 表

**验收：**

| 项 | 标准 |
|---|---|
| 同 project_local | 任意时刻 ≤1 running |
| 隔离并行 | 两 isolated 可同时 running |
| 不假失败 | 等待中不得标 failed |
| 可观测 | 用户能回答「谁在占用目录」 |

**Out of scope:** Multica daemon path mutex 文件锁、leader 免锁特例（可作 C1.1）。

---

## Task C2: Tool-aware idle / ToolWatchdog（P0）

**Demo:**  
1) 模拟/真实：run 发出 `tool_start` 后长时间无其它事件，**在 idle 30m 内不杀**（可用测试把阈值调到秒级）。  
2) tool 窗口耗尽（默认 2h，测时用 env 秒级）→ fail 文案含 `tool watchdog` / `in-flight tool`。  
3) 无 tool、纯静默 → 仍按 idle 30m（测时秒级）失败。

**设计拍板：**

| 项 | 选择 |
|---|---|
| 进程内状态 | `run-worker` 内存：`Map<runId, { toolDepth, lastToolName }>`；`tool_start` +1，`tool_end` -1 |
| 持久化 | **可选薄**：`agent_runs.tool_inflight` integer 或仅依赖内存 + heartbeat 语义；进程崩溃走 orphan 收尸已有 |
| Sweeper | `failStaleRunningRuns`：若 toolDepth>0（需可读：内存 **或** DB 标志）用 `MA_ISSUE_TOOL_IDLE_MS`（默认 2h），否则 `MA_ISSUE_IDLE_MS`（30m） |
| Chat | 保持进程 pulse 2min；可不接 tool 窗口（chat 已有 wall） |
| 文案 | `stale: idle timeout …` vs `stale: tool watchdog (tool X in flight …)` |

**Files:**

- Modify: `stale-runs.ts` — `getIssueToolIdleMs()`；fail 分支区分
- Modify: `run-worker.ts` — onEvent 维护 toolDepth；可选写 DB `toolInflight` / `lastToolName`
- Modify: schema（若落库）+ reshape + Settings 健康展示阈值说明
- Progress: `app/.progress/ux-trust-c2-tool-watchdog-impl-1.md`

**步骤：**

- [ ] Step 1: env + getters + 单测 format 错误文案
- [ ] Step 2: run-worker toolDepth；touch heartbeat 逻辑保持「任意事件续命」——**关键是 sweeper 窗口切换**
- [ ] Step 3: 脚本模拟 tool_start 后缩短 env，断言未到 tool 窗口不 fail
- [ ] Step 4: Settings/Runs 失败原因人话（shared 映射若有）
- [ ] Step 5: typecheck + progress + phase 表

**验收：** tool 进行中不按 30m idle 误杀；tool 卡死可杀；无 tool 行为与现网一致。

**Out of scope:** Codex semantic inactivity、OpenCode 专用 10m 分支（可记 follow-up）。

---

## Task C3: Skills 按 project 运营（P1）

**Demo:**  
1) Project 绑真仓且仓内有 `.skills/foo/SKILL.md` → Skills 列表/筛选可见「来自项目 X」或导入目标可选该 project。  
2) **无** workspace cwd 时，用户级 `~/.multi-agent/skills` 导入仍成功。  
3) 写项目级 skill：目标选 project → 写入 `localPath/.skills`，失败时 path 无效有人话。

**设计拍板：**

| 项 | 选择 |
|---|---|
| 读 | 已有 project_local 注入；列表 API 增加 `source: user \| workspace \| project` + `projectId?` |
| 写 | import/create 支持 `target: user \| workspace \| project` + `projectId` |
| UI | Skills 页 filter + 导入对话框目标；无 workspace 不禁用用户级 |
| 不做 | 多 resource、skill 市场、自动同步 git |

**Files:**

- `skill/scanner.ts` · `import-url.ts` · routes/skills · `SkillsPage` · `CreateSkillDialog`
- Progress: `app/.progress/ux-trust-c3-skills-project-impl-1.md`

**步骤：**

- [ ] Step 1: API list 带 source/project；扫描 `project.localPath/.skills`
- [ ] Step 2: import/create 写 project 路径
- [ ] Step 3: UI 目标选择 + 空态文案
- [ ] Step 4: 手工/Playwright：无 MA_WORKSPACE 仍可 user 导入
- [ ] Step 5: progress + phase

---

# Wave D — 连续性与执行手感（P1）

## Task D1: Chat 流式 / 过程可感（P1）

**Demo:**  
Chat 发「写一首短诗」或跑带 tool 的 CLI：思考卡内 **进度文本滚动更新**；若 backend 推 `message` 片段，气泡可先出 partial（至少 progress 不假死）。  
停止按钮保持。

**设计拍板：**

| 项 | 选择 |
|---|---|
| 最小 | 订阅 `run:progress` + 最近 `run:message` tool_start 名称展示在 ThinkingRow |
| 增强 | assistant 气泡在 running 时挂 partial 文本（WS `message` 累积） |
| 不做 | 真 token SSE 新协议、改 backend 契约 |

**Files:** `ChatPage.tsx` · `ws.ts` / hooks · 确认 claude `message_delta` 是否已 publish（若仅 log，worker 已把 delta→progress）

**步骤：**

- [ ] Step 1: ThinkingRow 稳定展示 progress + 最近 tool 名
- [ ] Step 2: 可选 partial assistant 行
- [ ] Step 3: Playwright：running 时 progress 区域非空（可用 mock WS 或真 run）
- [ ] Step 4: progress 文档

---

## Task D2: 隔离 workdir 复用叙事（P1）

**Demo:**  
同 issue 第二次 run：详情显示 **相同** `cwd_path`（isolated_issue）+ 文案「沿用本 issue 隔离工作目录」。  
Settings 或 Run 详情提供「打开目录说明」/可选「清理该 issue 隔离目录」（慎：确认对话框）。

**设计：**  
路径逻辑已在 `issueIsolatedWorkDir`；本刀 **几乎不改解析**，补 UI + 文案 + 可选 `DELETE` 清理 API（仅 isolated_*，禁止删 project_local）。

**Files:** `RunDetailPage` · `IssueRunHistory` · 可选 `routes/runs.ts` cleanup · `resolve-run-cwd` export helper

---

## Task D3: Run tool 叙事加厚（P1）

**Demo:**  
Run 详情时间线：tool_start 显示 **工具名 + 参数摘要一行**（截断）；过滤「仅工具」已有则加固空态。  
opencode：能解析的继续解析，不能则诚实「结束才有输出」（不假装流式）。

**Files:** `RunEventTimeline.tsx` · `RunDetailPage` · `opencode.ts` 仅安全增强

---

# 3. 阶段完成标准（Wave C+D）

同时满足可宣称 **UX Trust 韧性+手感收官**（可再开 onboarding/Wiki 分根阶段）：

- [ ] 同 `project_local` path 任意时刻 ≤1 running；等待可解释  
- [ ] tool in-flight 使用 tool idle 窗口；失败文案可区分 idle vs tool  
- [ ] Skills 用户级不依赖 workspace；项目级可对 localPath  
- [ ] Chat 执行中过程信息可持续更新（非只有转圈）  
- [ ] Issue 隔离目录复用对用户可见  
- [ ] 每刀 progress + phase 表勾选 + typecheck  
- [ ] C1/C2 至少有一条自动化脚本或 Playwright 证据  

---

# 4. 风险与决策边界

| 风险 | 缓解 |
|---|---|
| queued 饿死（永远排在后） | path 释放后现有 worker 轮询/claim 需能再次捡起；C1 验证「A 结束后 B 能 running」 |
| Win 路径大小写/斜杠 | lock key 统一 normalize + lower |
| toolDepth 与崩溃 | orphan recover 已有；内存丢失时退回纯 idle |
| 锁过严（误伤 isolated） | **仅 project_local** |
| 清理隔离目录误删真仓 | API 校验 mode≠project_local |

**须问人（本计划默认已拍板，仅下列变更需停）：**

- 要把 path 等待做成正式 DB status 枚举（破坏性）  
- 允许同 path 并发 N>1  
- 在 project_local 上做 CLI session resume  

---

# 5. 建议会话切分

| 会话 | 刀 | 备注 |
|---|---|---|
| 1 | **C1** | 最厚、最优先；可独立关刀 push |
| 2 | **C2** | 可紧接 C1；共享 run-worker |
| 3 | **C3** | 可与 D 并行另一会话 |
| 4 | **D1** | 前端为主 |
| 5 | **D2+D3** | 可合并一刀若薄 |

**下一刀默认：C1。**

---

# 6. 关刀模板（每刀）

```md
# UX Trust CN/DN — <title>
Date / Branch main
## 范围 / Multica 对照一句
## 决策表
## 改动文件
## 验收证据（typecheck / 脚本 / Playwright）
## 下一刀
```

更新：`phase-multica-ux-trust-2026-07-21.md` 进度表 · `CONTEXT.md` 方位。
