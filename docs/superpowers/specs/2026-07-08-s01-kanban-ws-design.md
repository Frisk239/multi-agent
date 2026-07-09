# S01 设计 spec — 看板 + WebSocket

> 状态：草案（待用户复核） · 日期：2026-07-08 · 切片：S01 · 分支：`feat/s01-kanban-ws`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/slices.md](../../../design/slices.md) · [design/synthesis.md](../../../design/synthesis.md) · multica `references/repos/multica/server/migrations/001_init.up.sql` · [chanpin/prototype/data/seed.js](../../../chanpin/prototype/data/seed.js) · prototype `assets/js/app.js` + `assets/css/tokens.css`
> 产出流程：superpowers brainstorming（本文件）→ writing-plans（实现计划）→ 执行者拆分

## 0. 摘要

S01 是平台的第一个垂直切片，端到端打通**最薄的看板实时同步路径**：monorepo 骨架 → shared 契约 → DB schema/seed → Issue CRUD API → 六列看板 → WebSocket 实时推送。它定义后续所有切片的地基，但本身刻意收窄到"看板"一个视图。

**一句话验收：** `pnpm dev` → 六列看板真实数据 → 拖拽/新建实时同步 → 双浏览器窗口联动。

---

## 1. 范围与架构边界

### 1.1 在范围内

```
┌─ web (Next.js :3000) ─────────────────────┐
│  六列看板页（唯一视图）                      │
│  React Query (GET/POST/PUT) + Zustand (WS) │
│  HTML5 拖拽 + 新建表单                       │
└──────────────┬────────────────────────────┘
        REST    │              WS
┌──────────────┴────────────────────────────┐
│ server (Fastify :3001)                      │
│  routes/issues (GET/POST/PUT)               │
│  routes/ws (workspace room)                 │
│  orchestration/event-bus (同步 in-process)  │
│  orchestration/ws-broadcaster (Map<wsId,WS>)│
│  db (Drizzle + better-sqlite3 + seed)       │
└─────────────────────────────────────────────┘
        ▲ import
┌───────┴─────────────────────────────────────┐
│ shared (Zod schema + 推导类型 + WS 事件类型)  │
└─────────────────────────────────────────────┘
```

三个包互能 import：web/server 都依赖 shared；web 不依赖 server（只经 REST/WS）。

### 1.2 不在范围内（避免范围蔓延）

| 排除项 | 归属切片 |
|---|---|
| Issue 详情页 / 时间线 / 评论 | S02 |
| Squad / @mention 路由 / briefing | S04 |
| 真实 agent 执行 / RuntimeBackend / 运行时发现 | S03 |
| agent_task_queue 执行状态机 / lease / sweeper | S03 |
| 收件箱 / 命令面板 / 设置页 / Wiki / Memory | S06+ |

### 1.3 刻意简化（YAGNI）

1. **position 排序只做"新卡浮顶 + 跨列移动"**，不做列内任意拖拽排序（float midpoint）。S01 验收不含列内排序。
2. **不建 workspace/agent/squad/skill 表的 CRUD**——只建表 + seed 静态数据（agent/squad 作为 issue 卡片上的 assignee label 存在）。S01 API 只有 issue CRUD。
3. **WS 不做房间订阅协议**——单 workspace（纯本地单用户），连上即收全部 issue 事件。

---

## 2. 技术选型（最终拍板）

| 组件 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript 全栈 | AGENTS.md 已锁定 |
| Monorepo | pnpm workspace | 轻量，TS 友好 |
| **后端** | **Fastify + @fastify/websocket** | 长驻 Node + WS 长连接密集 + 事件驱动是主场；@fastify/websocket 底层即 ws 库 |
| ORM | Drizzle + better-sqlite3 | sqlc 风格类型安全；纯本地零配置 |
| 迁移 | drizzle-kit | TS-first |
| 前端 | Next.js (App Router) | multica/WeKnora 同路线 |
| 前端状态 | React Query + Zustand | multica 已验证组合；前者管服务端态，后者管客户端态（WS） |
| 校验 | Zod（shared 包） | 全栈共享契约 |
| 开发工具 | tsx（server 热重载）+ next dev | |

> **选型论证（针对最终产物）：** 本项目是 Node 长驻编排进程 + WS 长连接密集 + 事件驱动。Fastify 的长驻服务模型与 @fastify/websocket 一等插件是主场；Hono 的 edge/请求-响应哲学对本产物是错配。

---

## 3. 数据模型

### 3.1 建表策略

照 multica `001_init.up.sql` 建表，但按 S01 范围分层：

**S01 会真正读写（API 暴露）：**
- `issue` — 看板主表，status 7 态

**S01 只建表 + seed 静态数据（为卡片展示 label，无 CRUD）：**
- `workspace` — 单行（"毕设 Multi-Agent"）
- `user` — 单行（林远）
- `agent` — 4 行（agt-lead/research/prd/proto），用于 assignee label
- `squad` — 3 行，用于 assignee label
- `skill` — 5 行（纯预留，S01 卡片不展示 skill）

**S01 完全不建（后续切片各自建）：**
- `comment` / `inbox_item` / `agent_task_queue` / `activity_log` / `issue_label` 等

### 3.2 `issue` 表（照 multica `001_init.up.sql:52-72`，TS 化）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | UUID，`defaultRandom()`。text 而非原生 uuid（SQLite 无原生 uuid） |
| `workspace_id` | text FK→workspace | NOT NULL |
| `identifier` | text | 人类可读 ID "FRI-11"（⚠️ 偏离 D9：multica 无此列，毕设 demo 需要） |
| `title` | text NOT NULL | |
| `description` | text | |
| `status` | text NOT NULL default 'backlog' | CHECK 7 态：`backlog/todo/in_progress/in_review/done/blocked/cancelled` |
| `priority` | text NOT NULL default 'none' | CHECK 5 档：`urgent/high/medium/low/none`（照 multica） |
| `assignee_type` | text | CHECK `member/agent/squad`，nullable |
| `assignee_id` | text | nullable，与 assignee_type 多态配对 |
| `creator_type` | text NOT NULL | CHECK `member/agent`（S01 创建者恒为 user） |
| `creator_id` | text NOT NULL | |
| `position` | real NOT NULL default 0 | 看板排序 |
| `created_at` | integer NOT NULL | unix ms timestamp |
| `updated_at` | integer NOT NULL | unix ms timestamp |

**索引：**
- `(workspace_id, status)` — 看板分组查询
- `(assignee_type, assignee_id)` — 多态指派查询（照 multica `idx_issue_assignee`）

**与 multica 的偏差：**
- 多了 `identifier` 列（见 D9）
- 丢了 multica 的 `parent_issue_id` / `acceptance_criteria` / `context_refs` / `due_date`（YAGNI，加列无损，等需要时加）

### 3.3 多态指派（学 multica `(type, id)` 判别列对）

DB 扁平存 `assignee_type` + `assignee_id` 两列；API 层 reshape 成嵌套 `{ type, id } | null`（TS 友好，与 seed.js 形态一致）。

### 3.4 seed 数据（照 seed.js 的 issues[]，状态改 multica 命名）

| identifier | title | status | assignee |
|---|---|---|---|
| FRI-11 | 毕设 multi-agent：产出 PRD 与可交互原型 | **in_review** ★ | 产品小队 |
| FRI-10 | 竞品矩阵与 Multica 功能对标 | done | 调研官 |
| FRI-09 | PRD 真源与 RTM 32 条 Must REQ | in_progress | PRD 官 |
| FRI-08 | Wiki 架构占位与 llm-wiki-pattern 对齐 | backlog | 未指派 |
| FRI-07 | Agent runtime 适配调研 | todo | 队长 |
| FRI-06 | Skill URL 导入 UX 走查 | done | 原型官 |
| FRI-05 | 答辩 Demo Script 排练 | todo | 产品小队 |
| FRI-04 | Memory 检索面板 mock | backlog | 未指派 |

> seed.js 用 `planning`（见 D1），seed 脚本写入 DB 时映射成 `backlog`。

---

## 4. shared 包契约（全栈真源）

`packages/shared/src/schema.ts` 导出 Zod schema + 推导类型。所有人（server 校验、web 校验、WS 事件）都 import 这里。

### 4.1 枚举

```typescript
export const IssueStatus = z.enum([
  'backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'
]);
export const Priority = z.enum(['urgent', 'high', 'medium', 'low', 'none']);
export const AssigneeType = z.enum(['member', 'agent', 'squad']);
export const CreatorType = z.enum(['member', 'agent']);
```

### 4.2 多态指派

```typescript
export const Assignee = z.object({
  type: AssigneeType,
  id: z.string().uuid(),
}).nullable();
// null = 未指派；非 null 时 type+id 必须同时存在
```

### 4.3 Issue 实体

```typescript
export const Issue = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  identifier: z.string(),           // "FRI-11"
  title: z.string(),
  description: z.string().nullable(),
  status: IssueStatus,
  priority: Priority,
  assignee: Assignee,               // { type, id } | null
  creatorType: CreatorType,
  creatorId: z.string().uuid(),
  position: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Issue = z.infer<typeof Issue>;
```

### 4.4 API 输入

```typescript
export const CreateIssueInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: Priority.optional().default('none'),
  assignee: Assignee.optional().default(null),
  // status 不接受——新建恒 backlog
  // identifier 不接受——服务端生成
});
export type CreateIssueInput = z.infer<typeof CreateIssueInput>;

export const UpdateIssueInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: IssueStatus.optional(),
  priority: Priority.optional(),
  position: z.number().optional(),
  // assignee S01 不允许改（拖拽不改指派）—— D 偏离：放开留给 S02+
}).refine((d) => Object.keys(d).some(k => d[k as keyof typeof d] !== undefined), {
  message: '至少传一个字段',
});
export type UpdateIssueInput = z.infer<typeof UpdateIssueInput>;
```

### 4.5 WS 事件

```typescript
export const IssueCreatedEvent = z.object({
  type: z.literal('issue:created'),
  issue: Issue,
});
export const IssueUpdatedEvent = z.object({
  type: z.literal('issue:updated'),
  issue: Issue,
  statusChanged: z.boolean(),
  prevStatus: IssueStatus.nullable(),
});
export type DomainEvent = IssueCreatedEvent | IssueUpdatedEvent;
```

---

## 5. API 设计

照 multica `router.go:983` 用 **PUT 而非 PATCH**（status + position 同一次 UPDATE）。

| 方法 | 路径 | 请求体 | 响应 | 学 multica |
|---|---|---|---|---|
| GET | `/api/issues` | — | `Issue[]`（扁平数组，前端自己按 status 分组） | `handler/issue.go:910` position 排序 |
| POST | `/api/issues` | `CreateIssueInput` | `Issue`（201） | `issueposition/position.go:17` NextTopPosition |
| PUT | `/api/issues/:id` | `UpdateIssueInput` | `Issue`（200） | `handler/issue.go:2373`+`:2591` |

### 5.1 GET /api/issues

- 查 `WHERE workspace_id = ? ORDER BY position ASC, created_at DESC`
- 返回扁平 `Issue[]`，**不做服务端分组**（保持 API 无视图逻辑）
- assignee 字段在服务端 reshape：扁平两列 → 嵌套 `{type,id}|null`；若 assignee_type 为 null 则 assignee 为 null

### 5.2 POST /api/issues

1. 校验 `CreateIssueInput`
2. 算 identifier：`SELECT MAX(CAST(SUBSTR(identifier,4) AS INT)) FROM issue WHERE workspace_id=?` → `FRI-<max+1>`
3. 算 position：`SELECT COALESCE(MIN(position),0)-1 FROM issue WHERE workspace_id=? AND status='backlog'`（新卡浮顶，学 multica `NextTopPosition`）
4. status 恒 `backlog`，creator 恒 `user-林远`
5. INSERT → 返回 Issue
6. `eventBus.publish({ type:'issue:created', issue })`

### 5.3 PUT /api/issues/:id

1. 校验 `UpdateIssueInput`
2. 读 prevIssue（取 prevStatus）
3. UPDATE 仅传字段（动态构造 SET）
4. **不加条件守卫**（⚠️ 偏离 D2：看板允许任意状态互转，守卫属执行状态机，S01 无执行）
5. 算 `statusChanged = status 变了`，`prevStatus = statusChanged ? prevIssue.status : null`
6. 返回新 Issue
7. `eventBus.publish({ type:'issue:updated', issue, statusChanged, prevStatus })`

---

## 6. WebSocket 设计

### 6.1 连接

`ws://localhost:3001/ws`（@fastify/websocket 升级）。无鉴权（纯本地单用户）、无房间订阅协议（连上即收全量 issue 事件）。

### 6.2 三跳广播（学 multica `listeners.go:151` + `task.go:2539`）

```
[1] service 层：状态转换后 eventBus.publish({ type, payload })
[2] EventBus（同步 in-process）：遍历订阅者调用
[3] WsBroadcaster：Set<WebSocket>.forEach(ws.send(JSON.stringify))
```

### 6.3 EventBus（最简）

```typescript
// orchestration/event-bus.ts
type Listener = (e: DomainEvent) => void;
class EventBus {
  private listeners = new Set<Listener>();
  on(fn: Listener) { this.listeners.add(fn); }
  publish(e: DomainEvent) {
    // 同步派发（学 multica，保证事件顺序），错误隔离不中断
    for (const fn of this.listeners) {
      try { fn(e); } catch (err) { console.error('[event-bus]', err); }
    }
  }
}
```

### 6.4 WsBroadcaster（最简）

```typescript
// orchestration/ws-broadcaster.ts
import type { WebSocket } from 'ws';
const OPEN = 1; // ws.readyState 的 OPEN 常量值
class WsBroadcaster {
  private conns = new Set<WebSocket>();          // 单 workspace，一个 set
  add(ws: WebSocket) { this.conns.add(ws); }
  remove(ws: WebSocket) { this.conns.delete(ws); }
  broadcast(e: DomainEvent) {
    const msg = JSON.stringify(e);
    for (const ws of this.conns) {
      if (ws.readyState === OPEN) ws.send(msg);
    }
  }
}
```

### 6.5 接线

server 启动时：`eventBus.on(e => wsBroadcaster.broadcast(e))`。
issue route 在 POST/PUT 成功后：`eventBus.publish(event)`。

### 6.6 客户端→服务端消息

**无。** S01 WS 是单向广播。客户端改数据走 REST，服务端再广播给所有人（含发起者）。

---

## 7. 前端设计（Next.js 六列看板）

### 7.1 视图范围（刻意收窄）

S01 web 只有**一个页面**：看板。不建侧栏导航、顶栏 Tab、路由切换（⚠️ 偏离 D6：prototype 完整 IA 不在 S01）。

### 7.2 六列看板结构

照 multica 7 态渲染 6 列，cancelled 不建列：

```
┌──────────┬────────┬──────────────┬───────────┬──────┬─────────┐
│ Backlog  │  Todo  │ In Progress  │ In Review │ Done │ Blocked │
│  #666    │ #888   │   #eab308    │  #22c55e  │#3b82f6│ #f97316 │
├──────────┼────────┼──────────────┼───────────┼──────┼─────────┤
│ FRI-08   │ FRI-07 │ FRI-09       │ FRI-11 ★  │FRI-06│         │
│ FRI-04   │ FRI-05 │              │           │FRI-10│         │
└──────────┴────────┴──────────────┴───────────┴──────┴─────────┘
```

- 列头：名称 + 状态色点（照 tokens.css，blocked 补 `--color-orange`）+ 计数
- 卡片：`identifier`(FRI-xx) + `title` + assignee label（"▸产品小队"/"▸未指派"）+ priority 标记
- 卡片按 `position ASC, createdAt DESC` 排序

### 7.3 交互（三个，对应验收画面）

**① 跨列拖拽改 status**（学 prototype `app.js:945-981`，补真实网络层）：
- HTML5 drag/drop：`dragstart` 存 issueId（闭包变量），`dragover` preventDefault，`drop` 取目标列 status
- drop 后：**乐观更新**（Zustand 立刻改本地 status）→ PUT `/api/issues/:id` body 仅 `{status}`（S01 拖拽不传 position，见 D4）→ 失败回滚
- 服务端 PUT → WS `issue:updated` → 其他窗口同步
- **不做列内排序**（⚠️ 偏离 D4：PUT 接口仍保留 position 字段供未来用，但 S01 前端拖拽不传它）

**② 新建 issue**：
- 看板顶部"+ 新建"按钮 → 内联表单（标题必填 + priority 下拉 + assignee 下拉）→ POST
- 服务端算 identifier + position + publish `issue:created`
- WS 推 `issue:created` → 所有窗口看板出现新卡（backlog 列浮顶）

**③ 双窗口实时同步**（验收核心）：
- React Query 拉 GET（初始）+ WS 收事件后更新 cache
- `issue:updated` 收到 → 若 statusChanged，React Query `setQueryData` 把 issue 搬到新列
- `issue:created` 收到 → 把 issue 追加到 backlog 列

### 7.4 状态管理分工

| 库 | 职责 |
|---|---|
| React Query | 服务端态：GET issues（`useQuery`）、POST（`useMutation`+invalidate）、PUT（`useMutation`+乐观更新） |
| Zustand | 客户端态：WS 连接状态、WS 事件 → React Query cache 更新 |
| WS 连接 | 单例，app 挂载时建立，组件订阅 store 里的连接状态 |

---

## 8. 前端原型复刻清单 + 偏离记录 ★

> 这一章是给前端执行者的逐项对照表，移植 prototype 时照此判断"复刻 / 偏离"。

### 8.1 复刻清单（照搬 prototype）

| 项 | prototype 来源 | 备注 |
|---|---|---|
| 设计 token（颜色/字体/间距/圆角） | `assets/css/tokens.css` | 全量移植，除状态色补 blocked |
| 暗色主题 | `--bg-base: #0a0a0a` 等 | |
| 卡片视觉（identifier + title + assignee label） | `app.js` `renderIssueCard`（约 :406） | |
| 跨列拖拽 API（HTML5 dragstart/dragover/drop） | `app.js` `bindKanbanDrag`（:945-981） | **机制复刻，数据层重写**：prototype 直接 mutate state + render()；S01 要调 PUT + 乐观更新 + WS 同步 |
| 卡片按 status 分组渲染 | `app.js` `kanbanBoard`（:394） | |

### 8.2 偏离记录（完整清单，待完善追踪表）

| # | 偏离点 | 偏离对象 | 原因 | 后续何时完善 |
|---|---|---|---|---|
| D1 | issue.status 用 multica 7 态（`backlog` 非 `planning`）+ 六列含 Blocked | prototype seed.js（5 态/planning/无 blocked） | multica 源码为准，prototype 有遗漏 | prototype 不改（mock），以本 spec 为准 |
| D2 | PUT 的 status 更新不加条件守卫 | slices.md "条件 UPDATE 状态机" | 看板允许任意状态互转，守卫属执行状态机 | S03 接 agent_task_queue 时加守卫 |
| D3 | 用 PUT 而非 PATCH | slices.md "PATCH status" | 照 multica `router.go:983` | 已定 |
| D4 | position 只做新卡浮顶，不做列内拖拽排序 | multica 有 float midpoint | YAGNI，S01 验收不含列内排序 | 拖拽改顺序 UX 出现时加 midpoint |
| D5 | 不建 comment/inbox/agent_task_queue 等表 | multica 全量 schema | YAGNI，S01 无触发路径 | S02/S03/S04 各自切片建 |
| D6 | web 只看板一页，不建侧栏/顶栏/IA | prototype 完整 IA | 刻意收窄到验收画面 | S06+ |
| D7 | 新建表单内联（非模态） | prototype 用模态 | 更简 | 可回退到模态，看 impl 偏好 |
| D8 | WS 单向广播，无房间协议 | multica 有 workspace room | 纯本地单 workspace | 多 workspace 时加 |
| D9 | 多了 `identifier` 列 + 服务端生成 FRI-xx | multica 无此列 | demo 路径 FRI-11 依赖它 | 保留，长期决策 |
| D10 | synthesis.md §4 "六状态"混淆 issue 态与 task 态 | synthesis.md | 文档内部 bug | 后续修 synthesis.md |

---

## 9. 验收标准（合并硬门槛）

### 9.1 工程门槛（main 稳定性铁律）

- [ ] `pnpm install` 无错
- [ ] `pnpm -r typecheck` 全绿（server + web + shared）
- [ ] `pnpm dev`（根 script 并行起 server:3001 + web:3000）一次起来

### 9.2 功能验收

- [ ] 打开 `localhost:3000`，六列看板，**数据来自 SQLite**（非 mock）
- [ ] seed 的 FRI-04~FRI-11 全部显示，FRI-11 在 In Review 列
- [ ] Backlog 列有 FRI-08 + FRI-04；Done 列有 FRI-06 + FRI-10（验证状态正确映射）
- [ ] Blocked 列存在（即使为空）+ 列头橙色点（验证补的 token 生效）
- [ ] 点"+ 新建"→ 填标题 → 提交 → 新卡以 **FRI-12** 出现在 Backlog 列浮顶

### 9.3 实时同步验收（核心）

- [ ] 拖 FRI-07 从 Todo 到 In Progress → 该窗口卡片移动 + DB status 更新（重启服务后仍是新状态）
- [ ] **开两个浏览器窗口**：窗口 A 拖卡片 → **窗口 B 实时看到卡片移动**
- [ ] 窗口 A 新建 issue → **窗口 B 实时看到新卡出现**
- [ ] WS 断开（关 server）→ 卡片仍可拖（乐观更新），重启后以 DB 为准

### 9.4 不验收的（划界）

- ❌ 列内拖拽排序（D4）
- ❌ issue 详情/评论/时间线（S02）
- ❌ assignee 变更（UpdateIssueInput 不含）
- ❌ 指派给 agent 后触发执行（S03）
- ❌ 侧栏/顶栏/路由切换（S06+）

---

## 10. Monorepo 结构（impl 执行者参考）

```
app/
├── package.json                  pnpm workspace 根（scripts: dev 并行起 server+web）
├── pnpm-workspace.yaml           packages: [server, web, shared]
├── tsconfig.base.json            共享 TS 配置
├── .gitignore
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── schema.ts          §4 全部 Zod 契约
│   │   │   └── index.ts
│   │   ├── package.json           name: @ma/shared
│   │   └── tsconfig.json
│   ├── server/
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      §3 Drizzle schema
│   │   │   │   ├── seed.ts        §3.4 seed
│   │   │   │   └── client.ts      better-sqlite3 + drizzle 实例
│   │   │   ├── orchestration/
│   │   │   │   ├── event-bus.ts   §6.3
│   │   │   │   └── ws-broadcaster.ts §6.4
│   │   │   ├── routes/
│   │   │   │   ├── issues.ts      §5
│   │   │   │   └── ws.ts          §6
│   │   │   └── index.ts           Fastify 组装 + 启动 :3001
│   │   ├── drizzle.config.ts
│   │   ├── package.json           name: @ma/server
│   │   └── tsconfig.json
│   └── web/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx           §7 看板页（唯一视图）
│       │   └── globals.css        移植 tokens.css + 补 --status-blocked
│       ├── components/
│       │   ├── KanbanBoard.tsx
│       │   ├── KanbanColumn.tsx
│       │   ├── IssueCard.tsx
│       │   └── NewIssueForm.tsx
│       ├── lib/
│       │   ├── api.ts             React Query hooks
│       │   ├── ws.ts              WS 单例 + Zustand store
│       │   └── queryClient.ts
│       ├── package.json           name: @ma/web
│       └── tsconfig.json
```

**包间依赖：** `@ma/server` 和 `@ma/web` 都 `"@ma/shared": "workspace:*"`。`@ma/web` 不依赖 `@ma/server`。

---

## 11. 后续

本 spec 经用户复核后，进入 superpowers writing-plans 产出实现计划（执行者拆分 + handoff），handoff 文档存 `app/.progress/s01-planner-1.md`。
