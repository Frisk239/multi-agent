# S04 设计 spec — Squad 小队（leader 委派闭环）

> 状态：草案（待用户复核） · 日期：2026-07-10 · 切片：S04 · 建议分支：`feat/s04-squad`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/slices.md](../../../design/slices.md) S04 · [references/deep/multica.md](../../../references/deep/multica.md) §3 · multica 源码 `references/repos/multica/server/migrations/084_squad.up.sql` + `090_task_is_leader.up.sql` + `127_task_squad_id.up.sql` + `handler/squad_briefing.go` + `handler/comment.go` + `handler/squad.go`
> 前置：[s02-planner-2.md](../../../app/.progress/s02-planner-2.md) · [s03-impl-1.md](../../../app/.progress/s03-impl-1.md)
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分

## 0. 摘要

S04 在 S01-S03 的编排外壳 + 真实执行之上，打通 **squad 委派闭环**：指派 squad → leader 被 brief（三段）→ leader 执行产出 @mention comment → comment-trigger 自动派 worker → worker 执行。**不新建任务抽象**，全部复用 S03 的 agent_run + RunWorker。这是答辩 FRI-11 路径的核心体验段（★★★★★）。

**一句话验收：** 指派 FRI-11 给产品小队 → leader(agt-lead) 被 brief → leader 执行产出 @mention 委派 → 被提及的 worker(opencode/cursor) 自动执行 → 时间线呈现完整委派链。

---

## 1. 范围与架构边界

### 1.1 完整数据流（FRI-11 答辩路径）

```
人 指派 issue 给 产品小队(squad)
  → PUT issue assignee=squad
  → 解析 squad → 拿 leader(agt-lead)
  → enqueue leader run（is_leader=1, squad_id 填充）
  → RunWorker claim → buildPrompt 检测 is_leader → 前置三段 briefing
  → leader(claude-code) 执行
  → 产出 finalText（含 [@调研官](mention://agent/agt-research) 等）
  → 写入终态 comment + run:completed
  → comment-trigger 解析这条 comment 的 mention://agent/<id>
  → 对每个被 mention 的 agent：enqueue worker run（per-(issue,agent) 去重）
  → RunWorker 并发 claim 多个 worker run（per-agent 槽）
  → worker(opencode/cursor) 各自执行
  → 各产出终态 comment + run:completed
  → 时间线呈现完整委派链：leader briefing → @mention → 各 worker 汇报
```

### 1.2 S04 新增的三块

| 块 | 内容 | 复用/改动 |
|---|---|---|
| **squad→leader 路由** | PUT issue assignee=squad 时，解析 leader enqueue | 改 S03 的 `enqueueAgentRun` + issues PUT 副作用 |
| **briefing 注入** | claim 时检测 is_leader run，buildPrompt 前置三段 | 改 S03 的 `buildPrompt` + agent_run 加列 |
| **comment-trigger** | comment 创建后解析 mention，对每个触发 enqueue | 新建 trigger 模块 + 改 S02 comment 创建流程 |

### 1.3 不在范围内（YAGNI + 范围收窄）

| 排除 | 归属/原因 |
|---|---|
| deferred-escalation（N 分钟无响应升级）| YAGNI，纯本地单人场景无意义（S2 决策）|
| issue-assignee-fallback / thread-parent 触发源 | 只做 @agent + @squad 两种（S3 决策）|
| Squad CRUD UI（创建/编辑小队）| S06+，S04 用 seed 静态数据 |
| 小队详情页（/squads/:id）| S06+ |
| sweeper | S03 R6 不做，S04 一致 |
| reconcile 机制 | 我们的 agent comment 是 run 完成后写，无竞争（§3.4）|
| briefing 预览 UI | run_message 里可见即可 |

---

## 2. 决策记录（brainstorm）

| 代号 | 决议 | 依据 |
|---|---|---|
| S1 | **完整闭环**（briefing + comment-trigger + squad→leader 路由）| 答辩 FRI-11 核心体验 |
| S2 | deferred-escalation 不做 | YAGNI |
| S3 | comment-trigger 支持 @agent + @squad 两种 | 覆盖 FRI-11，省 fallback/thread-parent |
| S4 | briefing claim 时注入 | 照 multica `090`/`127` migration |
| S5 | 不同 worker 可并发，同一 agent 串行 | per-(issue,agent) 去重 + per-agent 槽 |
| S6 | briefing 内容用 seed.js 的 squad 字段 | protocol + directive 已有 |
| S7 | 并发槽 per-agent（照 multica max_concurrent_tasks）| seed: lead/proto=6, research/prd=4 |
| S8 | @agent 自指放行（靠去重防循环），@squad 自指才跳过 | multica `comment.go:2177` + 简化（leader/worker 不重叠）|
| S9 | briefing 前置（非 multica 的 append）| 我们无 agent.Instructions 层，briefing 是最高优先级角色指令 |
| S10 | 不做 reconcile，comment 写入即触发 | 我们的 agent comment 是 run 完成后写，无竞争 |

---

## 3. 数据模型

### 3.1 squad 表扩展（补 S01 漏建的 briefing 字段）

当前 squad 表只有 id/name/leaderId/createdAt。加 migration：

| 新列 | 类型 | 说明 |
|---|---|---|
| `operating_protocol` | text NOT NULL default '' | briefing 第一段：Operating Protocol（seed.js 内容）|
| `mission_directive` | text NOT NULL default '' | briefing 第三段：Mission Directive（seed.js 内容）|

### 3.2 squad_member 表（简化版）

学 multica `084_squad.up.sql:17`，但简化——multica 的 `member_type IN ('agent','member')` 服务企业场景（人类加入小队），我们纯本地成员恒是 agent，**不建 member_type / role / 独立 id 列**：

| 列 | 类型 | 说明 |
|---|---|---|
| `squad_id` | text FK→squad | 复合 PK 一半 |
| `agent_id` | text FK→agent | 复合 PK 一半 |

PK = `(squad_id, agent_id)`。leader 不进此表（leader 在 squad.leaderId 单独存，roster 是"可被 @mention 的成员"）。

### 3.3 agent 表扩展

加 per-agent 并发上限（照 multica `001_init.up.sql:45` max_concurrent_tasks）：

| 新列 | 类型 | 说明 |
|---|---|---|
| `concurrency` | integer NOT NULL default 1 | per-agent 并发上限；seed: lead/proto=6, research/prd=4 |

### 3.4 agent_run 表扩展（照 multica 090/127 migration）

| 新列 | 类型 | 说明 |
|---|---|---|
| `is_leader` | integer NOT NULL default 0 | 0/1，标记 squad-leader run |
| `squad_id` | text nullable | 若是 leader run，记录来源 squad（查 briefing）|

> **为什么用 flag 而非查 issue.assignee_type='squad'**（照 multica `090_task_is_leader.up.sql:1-7` 血泪教训）：同一 agent 可能既是一个 squad 的 leader 又是另一个的成员；`@squad` mention 在非 squad 指派的 issue 上也需要 leader briefing。flag 在 enqueue 时盖一次最可靠。

### 3.5 seed 数据（照 seed.js 补全）

**squad 表补 protocol/directive：**

| squad | operating_protocol | mission_directive |
|---|---|---|
| sqd-product | 1. 队长接收 Issue briefing\n2. 按专精 @mention 委派\n3. 成员回帖交付物路径\n4. 队长汇总后请求 MVP 签核 | 基于 chanpin 真源产出 PRD + RTM + 可交互原型，Must 路径可点通。 |
| sqd-philosophy | 文献综述 → 论点提炼 → 答辩材料。 | 人文类课题调研与写作支持。 |
| sqd-eco | 数据采集 → 分析 → 可视化报告。 | 生态监测与数据分析 mock 小队。 |

**squad_member 表（照 seed.js memberIds）：**

| squad | members |
|---|---|
| sqd-product | agt-research, agt-prd, agt-proto |
| sqd-philosophy | agt-research |
| sqd-eco | agt-research, agt-proto |

**agent 表补 concurrency：** agt-lead=6, agt-research=4, agt-prd=4, agt-proto=6（照 seed.js）

> **seed.ts 改动（impl 必做）**：S04 的 migration 是纯 DDL（ADD COLUMN + CREATE TABLE），现有行被填 default。seed.ts 必须更新以填入真实值：
> - squad 的 `db.insert(squads).values(...)` 补 `operatingProtocol` + `missionDirective` 字段
> - agent 的 `db.insert(agents).values(...)` 补 `concurrency` 字段
> - 新增 `db.insert(squadMembers).values(...)` 插入成员关系（照上表）
> - 其余 seed（issue 8 条 + comment 6 条）不动
> - seed 仍不幂等（S01 已知问题），重跑前删 dev.db* → migrate → seed

---

## 4. shared 契约扩展

S03 的 `AgentRun` schema（impl-1 产出）缺 leader 标记。S04 扩展：

```typescript
// AgentRun 加两字段（对齐 DB §3.4）
export const AgentRun = z.object({
  // ... 现有字段 ...
  isLeader: z.boolean().default(false),       // 是否 squad-leader run
  squadId: BusinessId.nullable(),             // 来源 squad（leader run 时填充）
});
```

reshape 的 `toAgentRun` 同步映射这两字段（`row.isLeader` → boolean，`row.squadId`）。

`Comment` schema 不变（comment-trigger 复用现有 Comment，靠解析 body 的 mention link）。

---

## 5. briefing 注入（claim 时）

### 4.1 buildPrompt 扩展

S03 现状：`buildPrompt(issueId): string`，拼 identifier+title+description+K=20 comments。

S04 改为 `buildPrompt(issueId, run): string`：

```typescript
function buildPrompt(issueId: string, run?: { isLeader: boolean; squadId: string | null }): string {
  const issue = load(issueId);
  const body = [`${issue.identifier}: ${issue.title}`, issue.description, recentComments(issueId, 20), 'Please work on this issue in the current workspace.']
    .filter(Boolean).join('\n\n');

  if (run?.isLeader && run?.squadId) {
    const squad = loadSquad(run.squadId);
    const members = loadMembers(run.squadId)  // squad_member join agent，跳过 leader
      .filter(m => m.id !== squad.leaderId);  // roster 不含 leader 自己
    const roster = members.map(m => `- ${m.name} — [@${m.name}](mention://agent/${m.id})`).join('\n');
    const briefing = [
      `# Squad Operating Protocol\n${squad.operatingProtocol}`,
      `# Squad Roster\n${roster}`,
      `# Mission Directive\n${squad.missionDirective}`,
    ].join('\n\n');
    return briefing + '\n\n---\n\n' + body;  // 前置（S9 决策）
  }
  return body;
}
```

**Roster 渲染**：照 multica `buildSquadRoster`（`squad_briefing.go:129`）——成员渲染成 `- Name — [@Name](mention://agent/<id>)`，**跳过 leader 本人**（`squad_briefing.go:156`）。S04 不渲染 skill（YAGNI，S05）。

> **briefing 前置 vs multica append**（S9）：multica 把 briefing append 到 agent.Instructions 之后（`daemon.go:1747`），因为它已有 per-agent Instructions 层。我们没有 Instructions 层，briefing 是最高优先级的角色指令（"你是 leader，用 @mention 委派"），逻辑上应先于具体任务。**这是基于 prompt 结构差异的合理偏离。**

---

## 5. squad→leader 路由

### 5.1 PUT issue assignee 副作用扩展

S03 现状（impl-2 接的）：assignee identity 变化 → cancelActiveRuns + 若 type=agent 则 enqueue。

S04 扩展：

```typescript
// assignee identity 变化后：
cancelActiveRunsForIssue(issueId);
if (newAssignee?.type === 'agent' && newAssignee.id) {
  enqueueAgentRun(issueId, newAssignee.id);                    // S03 已有
} else if (newAssignee?.type === 'squad' && newAssignee.id) {  // S04 新增
  const squad = loadSquad(newAssignee.id);
  enqueueLeaderRun(issueId, squad.leaderId, squad.id);         // is_leader=1, squad_id
}
// null（取消指派）不触发 run
```

> **前端 confirm**：指派 squad 复用 S03 的 AssigneeSelect confirm 逻辑（S03 N10 决策"指派 agent 前 confirm"）。squad 指派同样烧 API 调用（触发 leader run），需 confirm。S03 的 AssigneeSelect 已能选 squad（S02 roster 含 squad），confirm 不区分 agent/squad，天然覆盖。S04 无需额外加 confirm。

### 5.2 enqueueLeaderRun

`enqueueAgentRun` 的变体，多设 `is_leader=1` + `squad_id`：

```typescript
function enqueueLeaderRun(issueId: string, leaderId: string, squadId: string): AgentRun | null {
  // per-(issue,agent) 去重（§6.1）——同一 leader 在同一 issue 不重复排
  if (hasActiveRun(issueId, leaderId)) return null;
  // ... insert agent_run with is_leader=1, squad_id=squadId, status='queued'
  // publish run:queued + wakeRunWorker
}
```

---

## 6. 并发模型改造（per-agent 槽）

### 6.1 enqueue 去重改为 per-(issue,agent)

S03 现状：`WHERE issue_id=? AND status IN ('queued','running')` —— 同 issue 单 active。

S04 改为：`WHERE issue_id=? AND agent_id=? AND status IN ('queued','running')` —— **同一 agent 在同一 issue 不重复，不同 agent 可并存**。

### 6.2 RunWorker 改 per-agent 槽（★核心重写）

S03 现状：全局 `busy` 标志（单 run 串行）。

**S04 是 run-worker.ts 核心循环的重写，不是小改。**

S03 模式：`tick() { if(busy) return; busy=true; claim一个; await执行; finally busy=false }` —— 同一时间只一个 run。

S04 改为：`tick()` 遍历 queued，对每个检查其 agent 的 per-agent 槽位，可用的 claim 并**并发**执行（不 await 一个再 claim 下一个）：

```typescript
async function tick(): Promise<void> {
  const queued = db.select().from(agentRuns).where(eq(status, 'queued')).orderBy(asc(createdAt)).all();
  for (const row of queued) {
    const agent = loadAgent(row.agentId);
    const activeCount = countRunsByAgent(row.agentId, ['running']);
    if (activeCount >= agent.concurrency) continue;   // 该 agent 槽满，跳过
    // claim（条件 UPDATE queued→running）+ fire-and-forget 执行（不 await）
    void executeRun(row);   // 并发：多个 run 同时跑
  }
}
```

**并发安全**：多个 `executeRun` 并发时，各自的 onEvent 回调并发写 DB（run_message insert）+ eventBus.publish。better-sqlite3 同步（线程安全），eventBus 同步遍历，安全。

> **对 S03 的破坏性**：run-worker.ts 的 `busy` 全局标志、`tick` 的单 claim 模式都要重构。这是 S04 impl 的重头戏之一。S03 的单 agent 执行路径（指派普通 agent）必须回归通过。

---

## 7. comment-trigger

### 7.1 触发逻辑

新建 `orchestration/comment-trigger.ts`，函数 `triggerFromComment(comment)`：

```typescript
function triggerFromComment(comment: Comment): void {
  // 只处理普通 comment（status_change 的 body 是 JSON，不含 mention）
  if (comment.type !== 'comment') return;
  const mentions = parseMentions(comment.body);  // 提取 mention://agent/<id> 和 mention://squad/<id>

  for (const m of mentions) {
    if (m.kind === 'agent') {
      // @agent 自指：放行（S8 决策，照 multica comment.go:2177）
      // 防循环靠 per-(issue,agent) 去重，不靠 author 判定
      enqueueAgentRun(comment.issueId, m.id);
    } else if (m.kind === 'squad') {
      const squad = loadSquad(m.id);
      // @squad 自指：leader @自己的小队 → 跳过（防循环）
      // 简化判定（leader/worker 不重叠）：authorId === leaderId 则跳过
      if (comment.authorType === 'agent' && comment.authorId === squad.leaderId) continue;
      enqueueLeaderRun(comment.issueId, squad.leaderId, squad.id);
    }
  }
}

// 正则提取 mention link
function parseMentions(body: string): Array<{ kind: 'agent' | 'squad'; id: string }> {
  const re = /mention:\/\/(agent|squad)\/([\w-]+)/g;
  const results = [];
  let match;
  while ((match = re.exec(body)) !== null) {
    results.push({ kind: match[1] as 'agent' | 'squad', id: match[2] });
  }
  // 去重（同一条 comment @同一个 agent 多次只排一次）
  const seen = new Set<string>();
  return results.filter(r => {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

### 7.2 防自指（S8）

| 情况 | 处理 | 依据 |
|---|---|---|
| @agent 自指（author==mentioned agent）| **放行** | multica `comment.go:2177`：cross-issue 自触发是 feature；防循环靠去重 |
| @squad，author 是该 squad 的 leader | **跳过** | 防止 leader @自己小队 → 触发自己 → 无限循环 |

> **简化依据**（照 multica 的复杂度裁剪）：multica 的 `shouldSuppressSquadLeaderSelfTrigger`（`squad.go:990`）查"该 agent 在此 issue 最近一次 task 的角色"，是因为 multica 允许同一 agent 身兼 leader+worker。我们的 seed 里 leader(agt-lead) 和成员(research/prd/proto)不重叠，简单 `authorId===leaderId` 判定足够。

### 7.3 挂接点（S10：写入即触发，不做 reconcile）

两个入口，都调 `triggerFromComment`：

1. **人工 comment**（S02 `POST /api/issues/:id/comments`）创建后 → `triggerFromComment`
2. **agent 终态 comment**（S03 RunWorker 完成后写 comment）→ `triggerFromComment`

> **不做 multica 的 `reconcileCommentsOnCompletion`**（`daemon.go:2917`）：multica 需要 reconcile 是因为它的 agent comment 在 run 期间流式产出，可能目标 agent 正忙。**我们的 agent 终态 comment 在 run 完成后才写**，此时 agent 空闲，立即触发无竞争（S10 决策）。

> **天然满足 multica 的 anti-loop 约束**：multica 对 agent 作者的 comment 只触发显式 @mention（`daemon.go:3004`，不触发 issue-assignee fallback）。我们只做 @agent/@squad 两种触发源（S3 决策），没有 fallback 路由可触发，天然满足。

### 7.4 循环熔断（防乒乓）★

**风险**：worker 完成后 @leader 汇报 → trigger 给 leader 排新 run（leader 已 completed，去重放行）→ leader 又 @worker → 无限循环。`per-(issue,agent)` 去重只防"有 active run 时重复排"，**防不了"完成后被重新排"**。

**两层防护**：

1. **软约束（照 multica）**：Operating Protocol（briefing 第一段）明确写"派完后停，不再回应成员汇报"。依赖 LLM 遵守，是主防线。

2. **硬熔断（S04 新增）**：enqueue 前检查该 issue 上的 run 总数，超过阈值则拒绝并记 system comment：

```typescript
const MAX_RUNS_PER_ISSUE = 15;  // 熔断阈值

function enqueueAgentRun(issueId, agentId): AgentRun | null {
  // per-(issue,agent) 去重（§6.1）
  if (hasActiveRun(issueId, agentId)) return null;
  // 熔断：issue 上总 run 数超限
  const totalRuns = countRunsByIssue(issueId);
  if (totalRuns >= MAX_RUNS_PER_ISSUE) {
    insertSystemComment(issueId, `⚠️ 已达 issue run 上限（${MAX_RUNS_PER_ISSUE}），停止派发。`);
    return null;
  }
  // ... enqueue ...
}
```

阈值 15 的依据：FRI-11 闭环正常路径 = 1 leader + 3 worker = 4 run。15 给 3 倍余量，防住失控但不误杀正常多轮交互。

---

## 8. 前端

### 8.1 几乎零新增

S04 核心机制全在服务端。前端复用现有 UI 呈现闭环：

| 闭环环节 | 前端呈现 | 现有组件 |
|---|---|---|
| 指派 squad | 详情页 assignee 显示"产品小队"label | S02 IssueHeader |
| leader run 执行 | RunStatusBar 状态 pill | S03 |
| leader 终态 comment（含 @mention）| 时间线 agent comment + mention pill | S02 Timeline + MarkdownBody |
| worker run 被触发 | 时间线出现 worker run 状态 | S03 RunTrace |
| worker 汇报 | 时间线 agent comment | S02 Timeline |

**关键：整个委派链在时间线上自然展开。** leader 的 briefing comment（含 @mention pill）→ worker 的汇报 comment，用户滚动时间线即见完整委派链。

### 8.2 不做的前端（YAGNI）

- ❌ 小队详情页（/squads/:id）—— S06+
- ❌ 创建/编辑小队 UI —— seed 静态数据
- ❌ briefing 预览 UI —— run_message 可见即可
- ❌ run 来源标记（若验收时用户困惑"worker 怎么突然跑了"再补）

---

## 9. 验收标准

### 9.1 工程
- [ ] `pnpm -r typecheck` 全绿
- [ ] `pnpm dev` 起 server + web

### 9.2 squad→leader 路由
- [ ] 指派 issue 给产品小队 → leader(agt-lead) 的 run 被 enqueue（is_leader=1, squad_id 填充）
- [ ] leader run claim 后 prompt 含三段 briefing（通过 buildPrompt 临时脚本/日志验证——prompt 是输入不进 run_message）
- [ ] briefing Roster 段含三个成员的 `[@Name](mention://agent/<id>)`，不含 leader 自己

### 9.3 comment-trigger 闭环（核心）
- [ ] leader run 完成 → 终态 comment 写入 → comment-trigger 解析 mention → 给被 @mention 的 worker enqueue run
- [ ] 多 worker 被 @ → 多个 run 并发（per-agent 槽）
- [ ] worker run 完成 → 各自终态 comment 写入时间线
- [ ] 时间线呈现完整委派链：leader briefing comment（@pill）→ 各 worker 汇报 comment

### 9.4 防自指 + 熔断
- [ ] @squad 且 author 是该 squad 的 leader → 跳过（不循环）
- [ ] @agent 自指 → 放行但 per-(issue,agent) 去重防循环
- [ ] issue run 总数达上限（15）→ 拒绝 enqueue + 记 system comment（防乒乓失控）

### 9.5 回归
- [ ] S01 看板 + S02 评论/时间线 + S03 单 agent 执行（指派普通 agent 直接跑）不破坏

### 9.6 答辩路径
- [ ] **FRI-11 点亮 squad 段**：看板 FRI-11（指派产品小队）→ 详情时间线见 leader briefing → @mention 委派 → worker 执行汇报

### 9.7 不验收
- ❌ deferred-escalation、issue-assignee-fallback、thread-parent
- ❌ Squad CRUD UI、小队详情页
- ❌ reconcile 机制

---

## 10. 本切片抄自（Borrow matrix）

| ID | 能力 | 主抄 | 深读锚点 | 我们落点 | 简化/不抄 |
|---|---|---|---|---|---|
| G-SQUAD-ROUTE | squad→leader 路由 | multica | deep/multica §3 路由决策 | PUT assignee=squad → enqueueLeaderRun | 无 |
| G-BRIEFING | 三段 briefing | multica | squad_briefing.go:112 | buildPrompt 前置 | 前置非 append（无 Instructions 层）；不渲染 skill |
| G-ROSTER | roster mention 渲染 | multica | squad_briefing.go:129 | members → `[@Name](mention://agent/<id>)` | 不含 leader、不含 skill |
| G-COMMENT-TRIGGER | comment mention 触发任务 | multica | comment.go:1433 | triggerFromComment | 不做 reconcile（S10）；只 @agent/@squad |
| G-SELF-TRIGGER | 防自指 | multica | squad.go:990 + 090 migration | @squad leader 自指跳过 | 简化判定（leader/worker 不重叠）|
| G-CONCURRENCY | per-agent 并发槽 | multica | 001_init.up.sql:45 | agent.concurrency + RunWorker 计数 | 无 |
| G-IS-LEADER-FLAG | is_leader 标记 | multica | 090/127 migration | agent_run.is_leader + squad_id | 无 |
| G-SQUAD-MEMBER | 成员关系表 | multica | 084_squad.up.sql:17 | squad_member 复合 PK | 不建 member_type/role（成员恒 agent）|

---

## 11. 风险

| 风险 | 缓解 |
|---|---|
| leader CLI 不产出 @mention（finalText 无 mention link）| comment-trigger 解析不到 mention 就不排 worker——闭环不成立但不会出错；验收前确认 prompt 里 briefing 的 roster mention 格式被 leader 复制 |
| 循环触发（A@B, B@A 乒乓）| per-(issue,agent) 去重（A 在此 issue 已有 active run 就不再排）+ @squad leader 自指跳过 |
| 并发改动破坏 S03 单 agent 执行 | 回归测试：指派普通 agent（非 squad）仍正常跑 |
| briefing 太长导致 prompt 超 context | Operating Protocol + Directive 是 seed 固定文本，可控；roster 仅 3 行 |
| seed squad 缺 protocol/directive 导致空 briefing | migration 给 default ''，seed 时强制写入 seed.js 的值 |

---

## 12. 下一步

1. ~~用户复核本 spec~~
2. writing-plans → `docs/superpowers/plans/YYYY-MM-DD-s04-squad.md`
3. 开 `feat/s04-squad`，impl-1 → 2 → 3（待 plan 拆分）

---

## 13. 自审记录

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD/TODO |
| 内部一致 | S1-S10 与数据/路由/trigger/前端一致 |
| 范围 | 完整闭环但排除项清晰（§1.3）|
| 歧义 | 防自指（S8）、并发（S5/S7）、briefing 前置（S9）均消歧 |
| 与 S03 | 复用 agent_run + RunWorker；改动：buildPrompt 签名、enqueue 去重、RunWorker 槽 |
| Borrow | §10 完整，8 项均有 multica 锚点 |
| multica 对齐 | 不建 squad task 抽象；briefing 注入；comment-trigger 复用 comment 管线 |

### 自审修订 R1-R3（2026-07-10 deep review）

| ID | 问题 | 性质 | 修复 |
|---|---|---|---|
| R1 | **乒乓循环**：worker @leader 汇报 → leader 被重排 → leader @worker → 无限。per-(issue,agent) 去重防不了"完成后被重新排" | **严重** | §7.4 加熔断：issue run 总数上限 15 + system comment；§3.5 Operating Protocol 软约束"派完后停" |
| R2 | shared `AgentRun` schema 缺 `isLeader`/`squadId`（impl-1 没加，S04 要补）| 契约缺口 | §4 新增 shared 契约扩展：AgentRun 加两字段 + reshape 映射 |
| R3 | RunWorker 并发改造是核心循环重写（非小改），执行者可能低估 | 标注缺失 | §6.2 标注"★核心重写"，给出 tick 改造伪代码 + 并发安全说明 |

### 第二轮自审修订 R4-R7（2026-07-10 deep review #2）

| ID | 问题 | 性质 | 修复 |
|---|---|---|---|
| R4 | triggerFromComment 未显式排除 status_change comment（body 是 JSON 不含 mention，靠"碰巧解析不到"不够清晰）| 代码清晰度 | §7.1 加 `if (comment.type !== 'comment') return` 前置判断 |
| R5 | §3.5 只列 seed 数据，没说"要改 seed.ts 的 insert 语句"（补 protocol/directive/member/concurrency）| 实操遗漏 | §3.5 补 seed.ts 改动说明（4 处 insert 要改/加）|
| R6 | §9.2 验收写"通过 run_message 验证 briefing"——briefing 是 prompt 输入不进 run_message（run_message 记 CLI 输出）| 验收方式错误 | 改为"通过 buildPrompt 临时脚本/日志验证" |
| R7 | 未说明指派 squad 是否需 confirm（S03 N10 只说 agent）| 遗漏 | §5.1 补：指派 squad 复用 S03 AssigneeSelect confirm，无需额外加 |
