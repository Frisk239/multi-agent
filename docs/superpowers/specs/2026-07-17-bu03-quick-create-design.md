# 补3 设计 — 快速派活（贴 Multica quick-create）

> 状态：**待用户审阅 spec** · 日期：2026-07-17  
> 切片：补充阶段 **补3** / `bu03` · 建议分支：`feat/bu03-quick-create`  
> 前置：main 含补1（真 Inbox + run 可靠性）；**补2（Agent/Squad 运营）建议已合**（assignee 列表可配置；未合则 seed agent 仍可验收）  
> 依据：Multica `EnqueueQuickCreateTask` + `buildQuickCreatePrompt` + `LinkTaskToIssue`（`references/repos/multica`）；用户决议 Issue 语义走 **Multica 对齐** + 工作触发 **M1**  
> 计划者只出设计；实现另派执行会话。不写业务代码于本文件阶段。

---

## 0. 摘要

用户在 Ctrl+K / 侧栏「快速派活」提交 **自然语言 prompt + agent|squad**。  
系统 **先不建 Issue**，enqueue 一条 **`kind=quick_create`** 的 run；执行 agent 用专用 prompt，通过 **`ma issue create`** 创建规范 Issue（标题/描述由 **编码 CLI 内模型** 决定，非编排服务另调 ChatCompletion）。  
建卡时 **带上所选 assignee（M1）** → 复用现网「创建带指派即 enqueue」→ **第二条工作 run** 真正干活。  
QC run 在 create 成功后 `issue_id` 回链（Link）；Inbox 通知派活结果。

**一句话验收：** 不填标题，一句话 + 指派 → agent 建出看板 Issue → 自动再起工作 run（无 CLI 时至少 Issue 落库 + QC/工作 run 终态可追踪）。

---

## 1. 背景与决策

### 1.1 为何不贴「服务端 LLM 总结标题 + 立刻建卡」

初选产品 A（Issue-first）与用户后补「贴 Multica」冲突。Multica 真值：

| 点 | Multica |
|---|---|
| 入队时 | **无 Issue**，task context 存 prompt |
| 标题/描述 | 执行 agent 调 `multica issue create` 时由 **agent 模型** 写 |
| 编排服务 | **不**单独 ChatCompletion 总结标题 |
| 回链 | `LinkTaskToIssue` |

### 1.2 已锁定决议

| 代号 | 决议 |
|---|---|
| P1 | 产品路径贴 Multica：**无 Issue 先 run → agent create Issue** |
| P2 | **M1**：`issue create` **必须**带本次所选 assignee → 触发现有工作 enqueue |
| P3 | 不引入「编排层第二套 LLM 写标题」（与 agent 重复） |
| P4 | 厚切片：后端+CLI+prompt 一棒，UI 一棒 |
| P5 | 不做 project/parent/attachment 全集（Multica 有，二期） |
| P6 | 不做云端 / Redis / 多机 |

### 1.3 与现网差异（必须改）

- 今日 `agent_run.issue_id` **NOT NULL** → QC 需要 **可空**  
- 无 agent 侧 `issue create` 工具 → 补 **`ma issue create`**（HTTP 调本地 server）  
- `buildPrompt` 假设必有 issue → 增加 **quick-create 分支**

---

## 2. 产品流程

```
用户: prompt + assignee(agent|squad)
        │
        ▼
POST /api/quick-runs
        │  解析 squad→leader；校验 agent 存在
        ▼
INSERT agent_run(
  kind='quick_create', issue_id=NULL,
  agent_id=leader|agent, quick_prompt=prompt, status=queued)
        │
        ▼
RunWorker claim → buildQuickCreatePrompt → Backend.execute
        │
        ▼
Agent 调用: ma issue create --title … --description-file … \
            --assignee-type/--assignee-id … \
            (--origin-run $MA_RUN_ID)
        │
        ▼
Server POST /api/issues（origin=quick_create, originRunId）
        ├─ 建 Issue + 指派
        ├─ Link: UPDATE agent_run SET issue_id WHERE id=originRunId
        └─ 现网 enqueue 工作 run（M1）
        │
        ▼
QC run 终态 completed|failed；Inbox 通知
工作 run 独立生命周期（进度/失败走补1）
```

**用户体感：**

1. 提交后 toast：「已派出派活任务」  
2. 稍后看板出现 Issue（WS `issue:created`）  
3. 若 runtime 可用，工作 run 开始；否则 Issue 在、工作 run 可能 failed（Inbox 已有）

---

## 3. 数据模型

### 3.1 `agent_run` 变更（migration `0009` 预留号，实现时接下一个序号）

| 列 | 类型 | 说明 |
|---|---|---|
| `issue_id` | TEXT NULL | **改为可空**；FK 保留 ON 行为按 SQLite 能力处理 |
| `kind` | TEXT NOT NULL DEFAULT `'issue'` | `'issue' \| 'quick_create'` |
| `quick_prompt` | TEXT NULL | 仅 QC 使用；issue run 为 null |

索引：可增 `idx_agent_run_kind_status`。

### 3.2 Issue 可选溯源（推荐，薄）

不必新表。二选一（实现选简单者）：

- **A.** `issue` 增加 `origin_type` TEXT NULL（`quick_create`）、`origin_run_id` TEXT NULL  
- **B.** 仅在 description 前缀机器行 + run 回链，不改 issue 表  

**推荐 A**，便于 Inbox/过滤与答辩叙事。

### 3.3 Shared 契约（草案）

```ts
export const AgentRunKind = z.enum(['issue', 'quick_create']);

// AgentRun 变更
issueId: BusinessId.nullable(),
kind: AgentRunKind.default('issue'),
quickPrompt: z.string().nullable().optional(),

export const CreateQuickRunInput = z.object({
  prompt: z.string().min(1).max(20000),
  assignee: z.object({
    type: z.enum(['agent', 'squad']),
    id: BusinessId,
  }),
});

export const CreateQuickRunResult = z.object({
  run: AgentRun, // kind=quick_create, issueId null 初始
});

// POST /api/issues 扩展（agent/CLI 用）
// 在 CreateIssueInput 或并行 CreateIssueFromAgentInput：
originType: z.literal('quick_create').optional(),
originRunId: BusinessId.optional(),
// assignee 已有 → M1 强制 CLI 传入与 quick-run 相同 assignee
```

### 3.4 对现有代码的闸（实现必扫）

凡 `run.issueId` 非空断言处：

- `buildPrompt`：QC 走专用分支，禁止读 issue  
- `run-worker` 终态 comment：`issue_id` 仍 null 时 **跳过** 写 comment 或写系统日志 only  
- 前端 `['runs', issueId]`：QC run 可用 `['run', runId]` 或 agent Runs Tab（补2）查看  
- WS `run:*` payload 允许 `issueId: null`  
- cancel / stale / orphan：按 runId 工作，**不依赖** issueId  

---

## 4. API

### 4.1 `POST /api/quick-runs`

**Body:** `CreateQuickRunInput`  
**行为：**

1. 校验 prompt、assignee  
2. agent：直接用；squad：`loadSquadDetail` → `leaderId`，无 leader → 400  
3. agent 不存在 → 404  
4. insert run + `wakeRunWorker`  
5. 201 `{ run }`  

**不做：** 服务端生成 title；不写 issue 行。

### 4.2 `POST /api/issues` 扩展（Link + origin）

当请求带 `originType=quick_create` + `originRunId`：

1. 校验 run 存在、`kind=quick_create`、尚未 link 或已 link 同 issue（幂等）  
2. 正常建 Issue（**必须**有 title；assignee **必须**与 quick-run 意图一致——见 §5 CLI）  
3. `UPDATE agent_run SET issue_id=? WHERE id=originRunId AND kind='quick_create'`  
4. 再走现网 create 后 enqueue（M1）  
5. 可选：`ensureIssueSubscriber` + inbox  

无 origin 的人类建卡路径 **行为不变**。

### 4.3 其他

- `GET /api/runs/:runId` 已有则保证返回可空 issueId  
- 不必单独 Link API（create 内联即可，贴 Multica 的 bind 时机）

---

## 5. CLI：`ma issue create`

对齐 Multica「agent 调 CLI 建卡」，落在现有 `app/packages/server/src/cli/ma.ts` 体系（JSON envelope 风格与 wiki 子命令一致）。

**最小参数：**

```
ma issue create \
  --title "..." \
  --description "..." | --description-file ./description.md \
  --assignee-type agent|squad \
  --assignee-id <id> \
  --priority none|low|medium|high|urgent \
  --origin-run <runId>   # 或环境变量 MA_RUN_ID
```

**行为：**

- HTTP `POST http://127.0.0.1:$PORT/api/issues`（PORT 与 server 约定，可用 `MA_SERVER_URL`）  
- body 含 origin 字段  
- stdout JSON envelope：`{ ok, data: { issue } }`  
- 非 2xx → 非 0 exit，便于 agent 重试/失败  

**QC prompt 硬性要求 agent：**

- 必须调用 create（或等价 HTTP，但文档只教 CLI）  
- **必须**传 assignee = 任务指派的 agent/squad（注入 prompt 的 id）  
- 多行 description 用 `--description-file`（学 Multica 防 shell 截断）  
- 禁止 `issue get` 尚不存在的 id  

---

## 6. Prompt：`buildQuickCreatePrompt`

新建函数（`runtime/prompt.ts` 或 `runtime/quick-create-prompt.ts`），学 Multica `buildQuickCreatePrompt` **精简中文版**：

**必含：**

1. 角色：quick-create 助手；**当前无 Issue**  
2. 用户原文 `quick_prompt` 引用块  
3. 字段规则：title 简洁；description 高保真（用户原意 + 可选 Context）；priority 映射或 omit  
4. assignee：**固定**使用本次 run 的 agent/squad id（写进 prompt，禁止改派）  
5. 唯一正道：`ma issue create ... --origin-run <id>`  
6. leader run：若 `isLeader`+`squadId`，在 QC prompt **前或后**叠一段精简 briefing（学 Multica SquadID hint）— **推荐叠加**，便于 create 后工作委派仍一致  

**拼接顺序（QC）：** skill → wiki bridge → memory（可选 prefetch by empty issue：可 **跳过 memory** 或 workspace scope）→ agent instructions（补2）→ squad briefing? → **QC 专用块**。  
**推荐：** QC **跳过 issue 历史 memory**，保留 wiki bridge + agent instructions + QC 块，避免无 issueId 的 prefetch 爆炸。

---

## 7. Worker / 终态

| 事件 | 行为 |
|---|---|
| QC running | heartbeat 等同 issue run（补1） |
| Agent 退出 completed 且 `issue_id` 已 set | `run:completed` + Inbox `run_completed` 或专用文案「派活建卡成功」 |
| Agent 退出 completed 但 `issue_id` 仍 null | 视为失败：`failed` + error `quick_create: issue not created` + Inbox |
| Agent failed/cancelled | 常规终态；Inbox |
| 工作 run | 完全走 issue 路径，与今日一致 |

**终态 agent comment：** 仅当 `issue_id` 非空时写入 issue 时间线；QC 无卡时不写 comment 表。

---

## 8. 前端

### 8.1 入口

- **Ctrl+K**：命令「快速派活」→ 展开二级 UI：assignee 下拉 + prompt textarea + 提交  
- **侧栏**「快速派活」按钮 → 同组件（模态或命令面板内嵌）  
- **不**要求标题字段  

### 8.2 成功/失败

- toast 成功 + `run.id` 可复制或链到 `/agents/:id`（Runs Tab，补2）  
- `issue:created` 仍刷新看板  
- 可选：提交后短轮询 `GET /api/runs/:id` 直到 issueId 非空再 toast「已创建 FRI-x」  

### 8.3 列表

- Agent Runs Tab（补2）显示 `kind=quick_create` 与可空 issue  
- 看板不展示无 issue 的 run（正确）

---

## 9. Inbox

复用补1 `notifyRunTerminal`；文案区分：

- QC 失败：`Run 失败 · 快速派活`  
- QC 成功：可用 `run_completed` + title 含「快速派活」  

可选新 type `quick_create`——**非必须**，实现时可只改 title 字符串以免扩枚举。

建卡成功后 `assigned` / 工作 run 通知与现网一致。

---

## 10. 安全与本地约束

- `ma issue create` 仅打本地 server；无鉴权与现网一致（单用户本地）  
- prompt 长度 cap 20k  
- 不在 API 回传模型密钥  
- QC 不绕过 agent 并发槽  

---

## 11. 非目标

- Multica 级 project / parent / attachment / keepOpen 模态  
- 无 Issue 的 chat session 主线  
- 编排进程 ChatCompletion 写标题  
- 改补2 范围；与补2 并行时以 main 契约为准，冲突等补2 合入再 rebase  

---

## 12. 验收标准

- [ ] `POST /api/quick-runs` 返回 `kind=quick_create` 且初始 `issueId=null`  
- [ ] Worker 跑 QC prompt；无 issue 不崩  
- [ ] `ma issue create --origin-run` 建卡并回链 run.issueId  
- [ ] M1：建卡带 assignee → 出现第二条 issue 工作 run（或尝试 enqueue）  
- [ ] QC 未建卡以 failed 收口 + Inbox  
- [ ] Ctrl+K / 侧栏可提交  
- [ ] typecheck；issues/wiki/memory/inbox 回归  
- [ ] 不 commit wiki/、*.db  

---

## 13. 执行拆分（预告，非 plan）

| 棒 | 内容 |
|---|---|
| **impl-1** | migration；run 可空 issueId；quick-runs API；prompt；worker 闸；`ma issue create` + issues origin/link；API smoke |
| **impl-2** | 快速派活 UI；toast/轮询；Agent runs 展示 kind；回归 handoff；PR |

分支：`feat/bu03-quick-create`。  
**writing-plans** 在用户批准本 spec 且补2 进度允许时另开。

---

## 14. 参考锚点

| 主题 | Multica | 本仓 |
|---|---|---|
| Enqueue QC | `task.go` `EnqueueQuickCreateTask` | 新建 `POST /api/quick-runs` |
| QC prompt | `daemon/prompt.go` `buildQuickCreatePrompt` | `runtime/prompt.ts` 分支 |
| Link | `LinkTaskToIssue` | issues create + UPDATE run |
| 建卡 CLI | `multica issue create` | `ma issue create` |
| Inbox | notifyQuickCreate* | 补1 writer |

---

## 15. 修订记录

| 日期 | 内容 |
|---|---|
| 2026-07-17 | Brainstorm：初选 A → 改贴 Multica；锁定 M1；成文 |
