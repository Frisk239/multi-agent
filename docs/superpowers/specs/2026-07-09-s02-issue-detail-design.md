# S02 设计 spec — Issue 详情 + 时间线 + 评论

> 状态：草案（自审修订 R1–R10 后 · 待用户复核） · 日期：2026-07-09 · 切片：S02 · 建议分支：`feat/s02-issue-detail`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/slices.md](../../../design/slices.md) · [s01-planner-2.md](../../../app/.progress/s01-planner-2.md) · S01 spec · multica `001_init.up.sql` comment 段 · [seed.js](../../../chanpin/prototype/data/seed.js) FRI-11 comments · prototype `app.js` `renderIssueDetailContent` / `parseMentions`
> 产出流程：superpowers brainstorming（本文件）→ writing-plans → 执行者拆分
> 决策记录：独立详情页 A · 详情可改状态 B · mention 渲染+@补全 B · status_change 自动写入 B · 轻 MD B · 固定本地用户 A · 补全 agent+squad B · WS 全实时 A · 方案 2 统一时间线

## 0. 摘要

S02 在 S01 看板地基上打通 **Issue 详情 + 时间线（评论 / 状态变更）+ 发评论 / @ 补全 + WebSocket 实时**。  
数据上采用 **一张 `comment` 表 + `type` 判别** 作为时间线真源（学 multica）；S03 执行事件可再扩展 type，前端列表模型不变。

**一句话验收：** 点 FRI-11 进详情 → seed 时间线（MD + mention pill）→ 发评论与改状态双窗口实时 → `@` 可补全 agent/squad。

**不包含：** mention 入队、真实 agent 执行、改指派、收件箱三栏、评论编辑删除。

---

## 1. 范围与架构边界

### 1.1 在范围内

```
┌─ web (Next.js :3000) ──────────────────────────────────┐
│  /                  六列看板（S01 + 卡片链到详情 + D12）   │
│  /issues/[id]       详情：Header + Timeline + Composer   │
│  React Query + WS 单例（扩展 comment:created）            │
│  react-markdown + mention pill + @ 补全                  │
└──────────────┬───────────────────────────┬───────────────┘
        REST   │                           │ WS
┌──────────────┴───────────────────────────┴───────────────┐
│ server (Fastify :3001)                                    │
│  issues: GET list / GET :id / POST / PUT（+status_change）│
│  comments: GET|POST /api/issues/:id/comments              │
│  agents|squads: GET 只读摘要（@ 补全）                     │
│  EventBus + WsBroadcaster（+ comment:created）            │
│  comment 表 + seed 时间线                                 │
└──────────────────────────────────────────────────────────┘
        ▲ import
┌───────┴──────────────────────────────────────────────────┐
│ shared：BusinessId 放宽(D11) + Comment/Timeline + 事件     │
└──────────────────────────────────────────────────────────┘
```

### 1.2 不在范围内

| 排除项 | 归属 |
|---|---|
| mention → agent_task_queue / comment-trigger | S04 |
| RuntimeBackend / 真 agent 写评论 | S03 |
| 改 assignee / 完整 agent 详情 | S04 / S06+ |
| 收件箱三栏 UI-ISS-001 | S06+ |
| comment 编辑/删除、thread 父回复 | 更晚 |
| progress_update / system / 工具调用事件写入 | S03+ |
| 登录 / 多用户 | 不做（纯本地） |

### 1.3 刻意简化（YAGNI）

1. **URL 只用 issue UUID**，不支持 `/issues/FRI-11` 解析。  
2. **人手评论作者固定** seed 用户 `user-linyuan`（林远），无 persona 切换。  
3. **status_change body 用 JSON**，前端格式化为中文句式，不另建事件表。  
4. **Markdown 轻量**：`react-markdown`，不上 GFM 表格插件。  
5. **S02 不放开 UpdateIssueInput.assignee**（决策：指派只读）。

---

## 2. 与 S01 的衔接（必须处理的遗留）

| ID | 内容 | S02 处置 |
|---|---|---|
| **D11** | seed 业务 id 为短串（`agt-lead`/`ws-local`/`user-linyuan`），shared 曾要求 uuid | **放宽**为 `BusinessId = z.string().min(1)`，覆盖 assignee / workspace / creator / author 等；issue 主键仍可由服务端发 UUID，但 Zod 统一 `BusinessId` 以免再踩坑 |
| **D12** | 拖拽/改状态无 onMutate 乐观更新 | **`useUpdateIssue` 实现** onMutate + onError 回滚；看板与详情共用 |
| 事件 | `IssueUpdatedEvent` 已有 `statusChanged` + `prevStatus` | PUT 在 `statusChanged===true` 时 **同事务** insert status_change 并 `comment:created` |
| 用户 | seed 已有 `user` 表一行 | 常量 `LOCAL_MEMBER = { id: 'user-linyuan', name: '林远' }`，**不要**再发明 `member-local` |

---

## 3. 数据模型

### 3.1 `comment` 表（时间线真源）

照 multica comment 精神，S02 列集：

| 列 | 类型 | 约束 / 说明 |
|---|---|---|
| `id` | text PK | `crypto.randomUUID()` |
| `issue_id` | text NOT NULL | FK → issue.id |
| `type` | text NOT NULL | S02 读写：`comment` \| `status_change`（Zod 枚举；DB 可 check 或应用层校验） |
| `author_type` | text NOT NULL | `member` \| `agent`（与 CreatorType 对齐；原型 seed.js 的 `human` → `member`） |
| `author_id` | text NOT NULL | 业务 id（`user-linyuan` / `agt-*`） |
| `body` | text NOT NULL | 见 §3.2 |
| `created_at` | integer NOT NULL | ms epoch（与 issue 一致） |

索引：`idx_comment_issue_created (issue_id, created_at)`。  
列表排序（R3）：`ORDER BY created_at ASC, id ASC`（同 ms 时稳定）。

**预留不在 S02 写入：** `progress_update` / `system`（Zod 枚举 S02 只含两种，S03 再扩）。

### 3.2 body 约定

| type | body |
|---|---|
| `comment` | Markdown 原文（可含 `[@名](mention://agent\|squad/<id>)`） |
| `status_change` | **JSON 字符串**，schema 见 shared：`StatusChangeBody` |

```ts
// StatusChangeBody
{ from: IssueStatus, to: IssueStatus }
```

前端展示：`{authorLabel} 将状态从 {中文 from} 改为 {中文 to}`。  
**禁止** status_change 存自由中文导致前后端漂移。

### 3.3 API 输出形状 `Comment`（TimelineItem）

```ts
{
  id: string;
  issueId: string;
  type: 'comment' | 'status_change';
  authorType: 'member' | 'agent';
  authorId: string;
  authorLabel: string;  // 服务端填充（user/agent map；member 用 LOCAL 名）
  body: string;         // comment: md；status_change: JSON 字符串
  createdAt: string;    // ISO datetime
}
```

`TimelineItem` 类型别名 = `Comment`（方案 2：统一列表模型）。

### 3.4 只读 Agent / Squad 摘要

S01 已有 `agent` / `squad` 表 + seed。S02 暴露：

```ts
AgentSummary  { id: string; name: string }
SquadSummary  { id: string; name: string }
```

### 3.5 Seed 时间线

- 按 **identifier** 找到 issue 行（因 issue.id 每次 seed 为新 UUID），再 insert comments。  
- **必含：** FRI-11 的 3 条（林远 / agt-lead / agt-research）。  
- **应含：** 原型里已有 comments 的其它 issue（FRI-10、FRI-09 等），按 seed.js 原文导入。  
- FRI-11 队长 body 保留 markdown + mention 链接原文。  
- **不**为历史状态补造 status_change（避免假历史）。  
- `authorType: human` → `member`，`authorId: user-linyuan`；agent 评论用对应 `agt-*`。  
- **Dev 库（R7）：** 新增 additive migration（`0001_*.sql`），不改写 `0000_*`。本地重置：`删除 packages/server/dev.db*` → `pnpm --filter @ma/server db:migrate` → `db:seed`。seed 脚本保持 S01 风格（空库插入）；不要在已有数据上盲目重跑 insert。

### 3.6 写路径（事务语义）

**POST comment**

1. 校验 issue 存在  
2. insert `type=comment`, author=LOCAL_MEMBER  
3. `eventBus.publish({ type: 'comment:created', comment })`  
4. 201 + Comment  

**PUT issue（status 变化时）**

1. 读 prev  
2. 事务（better-sqlite3 同步事务即可）：UPDATE issue；若 `input.status !== undefined && input.status !== prev.status` → insert status_change（**author 恒 LOCAL_MEMBER**，R8；body=JSON）  
3. publish `issue:updated`（沿用 S01 字段，含 `statusChanged` / `prevStatus`）  
4. 若写了 status_change → publish `comment:created`  
5. 返回更新后的 Issue  

看板拖拽与详情改状态走同一 PUT，故时间线行为一致。  
S02 不存在 agent 改状态路径；若未来 agent 改状态，author 规则留给 S03。

---

## 4. shared 契约（Zod）

### 4.1 BusinessId（D11）

```ts
export const BusinessId = z.string().min(1);
// 用于：Issue.id / workspaceId / creatorId / Assignee.id /
// Comment.id / issueId / authorId / AgentSummary.id / SquadSummary.id 等
// 不再使用 z.string().uuid() 约束业务字段
```

`CreateIssueInput.assignee.id` 同步改为 `BusinessId`（即使 S02 UI 不创建带指派的 issue，契约要自洽）。

### 4.2 Comment 相关

```ts
CommentType = z.enum(['comment', 'status_change'])
AuthorType  = z.enum(['member', 'agent'])  // 可与 CreatorType 合并导出

StatusChangeBody = z.object({ from: IssueStatus, to: IssueStatus })

Comment = z.object({
  id: BusinessId,
  issueId: BusinessId,
  type: CommentType,
  authorType: AuthorType,
  authorId: BusinessId,
  authorLabel: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
})
TimelineItem = Comment  // 别名

CreateCommentInput = z.object({
  body: z.string().min(1),
  // type 不接受——恒 comment
  // author 不接受——服务端 LOCAL_MEMBER
})
```

### 4.3 WS 事件

```ts
// 保留
IssueCreatedEvent / IssueUpdatedEvent

// 新增
CommentCreatedEvent = z.object({
  type: z.literal('comment:created'),
  comment: Comment,
})

DomainEvent = IssueCreatedEvent | IssueUpdatedEvent | CommentCreatedEvent
```

### 4.4 Issue 实体

仅 D11 放宽 id 字段；**不**在 S02 把 assignee 加回 `UpdateIssueInput`。

---

## 5. API

Base：`http://localhost:3001`（与 S01 一致）。

| 方法 | 路径 | 请求 | 响应 | 备注 |
|---|---|---|---|---|
| GET | `/api/issues` | — | `Issue[]` | S01 |
| GET | `/api/issues/:id` | — | `Issue` | **新增**；与 list **同一 `toIssue`**（R6）；404 |
| POST | `/api/issues` | CreateIssueInput | Issue 201 | S01 |
| PUT | `/api/issues/:id` | UpdateIssueInput | Issue | **扩展** status_change 副作用 |
| GET | `/api/issues/:id/comments` | — | `Comment[]` | `created_at ASC, id ASC`（R3）；issue 不存在 404 |
| POST | `/api/issues/:id/comments` | CreateCommentInput | Comment 201 | |
| GET | `/api/agents` | — | `AgentSummary[]` | 只读 |
| GET | `/api/squads` | — | `SquadSummary[]` | 只读 |

错误：400 Zod flatten；404 资源不存在。  
CORS / WS 路由保持 S01。

**authorLabel 解析规则：**

- `member` + `user-linyuan` → `林远`（查 user 表或常量）  
- `agent` → agent.name  
- 未知 → `authorId` 原文  

---

## 6. WebSocket

### 6.1 事件表

| type | 触发 | payload |
|---|---|---|
| `issue:created` | POST issue | S01 |
| `issue:updated` | PUT issue | S01（含 statusChanged/prevStatus） |
| `comment:created` | POST comment **或** PUT 产生 status_change | `{ type, comment: Comment }` |

连接模型不变：连上即收全部 workspace 事件（单用户本地）。

### 6.2 客户端处理（幂等）

- `comment:created`：`queryKey ['comments', issueId]` 按 `comment.id` 去重 append  
- `issue:updated`：更新 `['issues']` 与 `['issue', id]`  
- 发起方：POST/PUT 的 HTTP 响应可先写入 cache；WS 回声靠 id 幂等（S01 R4）  
- **乱序：** 允许先收到 comment 后 issue 或相反；status 以 issue 缓存为准，时间线条以 comments 列表为准  
- **评论（R9）：** 不要求对 POST comment 做乐观插入；以 201 body + WS 去重为准  
- **改状态（R2）：** D12 乐观更新**只改 Issue 的 status 字段**（列表+详情 cache）；**禁止**客户端乐观插入 `status_change` 时间线条（等服务端 `comment:created` / 或 PUT 成功后若响应附带可再拉 comments——S02 选等 WS/可在 PUT onSuccess 时 `invalidate ['comments', id]`）

---

## 7. 前端

### 7.1 路由

| path | 内容 |
|---|---|
| `/` | KanbanBoard |
| `/issues/[id]` | Issue 详情 |

全局 `layout.tsx` 继续挂 Providers（Query + WS）。

### 7.2 详情 IA

```
← 看板 | FRI-11                    [状态 select · 七态全量 R4]
标题
描述（纯文本转义，R10 不做 MD）
优先级 · 指派 label（只读，无编辑控件 R5）
── 动态 · N 条 ──
  作者 · 时间 · [状态变更]
  body（MD+pill 或 status 句式）
── Composer ──
  textarea + @ 补全 + 发送
```

- **状态 select：** `IssueStatus` 全部 7 值（含 `cancelled` / `blocked`），不跟看板隐藏列绑定。  
- **优先级 / 指派：** 只展示，无下拉。

### 7.3 组件（建议路径 `packages/web/components/`）

| 组件 | 职责 |
|---|---|
| `IssueDetail`（页级） | 组合数据与布局 |
| `IssueHeader` | 返回、identifier、title、desc、status、只读 meta |
| `Timeline` / `TimelineItem` | 按 type 渲染 |
| `MarkdownBody` | react-markdown；`mention://agent|squad/...` → `.mention-pill` |
| `CommentComposer` | 发送 + 触发补全 |
| `MentionAutocomplete` | agents∪squads 过滤，插入 `[@name](mention://agent|squad/<id>)` |

看板：`IssueCard` 标题（或指定热区）`<Link href=/issues/[id]>`；拖拽区与链接分区，避免冲突。

### 7.4 Hooks（`lib/api.ts` 扩展）

- `useIssue(id)` · `useComments(issueId)` · `useCreateComment`  
- `useAgents` · `useSquads`  
- `useUpdateIssue`：**实现 D12**（optimistic 更新 `['issues']` + `['issue', id]` 的 status 等字段；**不**乐观写 comments，见 §6.2 R2）

### 7.5 @ 补全

1. 检测 `@` 触发与 query 字符串  
2. 列表 = agents + squads（展示名；squad 可标注「小队」）  
3. 选中插入 mention markdown，**不**调用任何触发 API  
4. 发送 body 原样 POST  

**Mention 语法（R1，前后端/渲染共用约定）：**

```
[@显示名](mention://agent/<id>)
[@显示名](mention://squad/<id>)
```

- 解析：Markdown 链接触发；`href` 匹配 `^mention://(agent|squad)/(.+)$`  
- pill 可见文本优先用 `[@显示名]` 的显示名；无法解析时 fallback `@` + id  
- 与原型差异：原型 regex 仅 `agent`；S02 **必须**支持 `squad`  
- 插入时显示名取 AgentSummary/SquadSummary.name；id 取对应 id  

### 7.6 Markdown

- 依赖：`react-markdown`  
- 允许：段落、标题、列表、强调、inline code、fenced code  
- 不允许：原始 HTML 透传  
- mention：自定义 `a` 组件，仅 `mention://` → `.mention-pill`（不可导航）；`http(s)` 外链可 `target=_blank` rel noreferrer  
- **Issue.description（R10）：** 详情页按纯文本 + 换行展示（`white-space: pre-wrap` + escape），**不对描述跑 react-markdown**（MD 只用于 comment body）

### 7.7 status_change UI

- `JSON.parse` + `StatusChangeBody.safeParse`；失败则显示 raw body  
- 样式次要于普通评论（dim 文本 / 左边框）

### 7.8 样式

复用 `globals.css` token；新增 `.mention-pill`、`.timeline-*`、`.issue-detail-*`（可对照 prototype CSS，不引入构建步骤到 prototype）。

---

## 8. 执行者拆分

| 会话 | 范围 | 验收门槛 |
|---|---|---|
| **impl-1** shared + DB | D11；Comment/事件 Zod；comment 表 migration；seed 评论；toComment reshape 骨架 | `pnpm -r typecheck`；seed 后 DB 有 FRI-11 的 3 条 comment |
| **impl-2** server | GET issue；comments CRUD 路由；agents/squads；PUT 事务+双事件；authorLabel | curl/脚本自测贴输出 |
| **impl-3** web | 路由详情；时间线 MD/pill；Composer+@；状态 select；D12；WS；§9 清单 | 浏览器 §9 全勾 |

计划者每段验收后写 handoff 注意点，再放行下一段。  
Handoff 路径：`app/.progress/s02-impl-N.md` / `s02-planner-N.md`。

---

## 9. 验收标准

### 9.1 工程

- [ ] `pnpm install` 无错  
- [ ] `pnpm -r typecheck` 三包绿  
- [ ] `pnpm dev` → :3000 + :3001  

### 9.2 功能

- [ ] 看板点 FRI-11 → 详情 URL 为 `/issues/<uuid>`，顶栏 identifier=FRI-11  
- [ ] 描述与只读指派「产品小队」可见  
- [ ] 时间线 ≥3 条 seed；队长条有标题样式 + mention pill  
- [ ] 发送评论 → 列表追加，作者「林远」  
- [ ] 详情改状态 → 顶栏更新 + 时间线 status_change 一条  
- [ ] 看板拖拽改状态 → 再进详情可见对应 status_change  
- [ ] `@` 补全能选 agent 与 squad，发送后 pill 正确  
- [ ] S01 看板新建/拖拽回归仍可用  

### 9.3 实时

- [ ] 双窗口同详情：A 发评论 → B 出现  
- [ ] 双窗口：A 改状态 → B 顶栏 + 时间线  
- [ ] WS 回声幂等（不因 HTTP+WS 双写出现两条同 id）  

### 9.4 明确不验收

- mention 入队、agent 自动回帖、改指派、收件箱、乐观更新在 WS 断开时的完整离线队列（D12 仅覆盖请求进行中的 UI）

---

## 10. 风险

| 风险 | 缓解 |
|---|---|
| D11 漏改某处仍 uuid() | impl-1 全局搜 `z.string().uuid` 清零业务字段 |
| seed issue id 不稳定 | 评论 seed 按 identifier join；前端从列表带 id 跳转 |
| PUT 双事件重复条 | comment id 幂等；status_change 仅 status 真变时写 |
| 拖拽与点击冲突 | 标题 Link + 卡片其它区域 drag |
| MD XSS | 不用 raw HTML；react-markdown 默认转义 |
| 乐观更新与时间线短暂不一致 | R2：不乐观插 status_change |
| 计划代码与实现漂移 | 以本 spec 为准；偏离写 handoff |
| 已有 dev.db 无 comment 表 | R7：migrate + 必要时删库重 seed |

---

## 11. 偏离与决议一览（brainstorm + 自审）

| 代号 | 决议 |
|---|---|
| N1 | 独立路由 `/issues/[id]`，非抽屉、非收件箱三栏 |
| N2 | 详情可改 status；assignee 只读 |
| N3 | mention pill + @ 补全；无 trigger |
| N4 | status 变更写 status_change 时间线条 |
| N5 | 轻量 markdown + mention（**仅 comment body**） |
| N6 | 作者固定 `user-linyuan` / 林远（非 member-local） |
| N7 | 补全 = agents + squads |
| N8 | comment:created 全实时 WS |
| N9 | 方案 2：comment 表 = 时间线，TimelineItem 别名 |
| D11/D12 | 本切片关闭 |
| R1 | mention 协议 agent\|squad 明确；pill 用括号内显示名 |
| R2 | D12 只乐观 Issue 字段，不乐观插时间线条 |
| R3 | comments 排序 created_at ASC, id ASC |
| R4 | 状态 select 七态全量 |
| R5 | 优先级/指派无编辑控件 |
| R6 | GET :id 与 list 共用 toIssue |
| R7 | additive migration；删库重 seed 文档化 |
| R8 | status_change author 恒 LOCAL_MEMBER |
| R9 | POST comment 不做乐观插入 |
| R10 | issue.description 纯文本，不跑 MD |

---

## 12. 自审记录（sequential-thinking + superpowers checklist）

| 检查项 | 结果 |
|---|---|
| Placeholder scan | 无 TBD/TODO；seed「应含其它 issue」已收紧为 FRI-11 必含 + 原型有则导入 |
| Internal consistency | 对齐 S01：`user-linyuan`、`IssueUpdatedEvent.statusChanged`、EventBus 同步广播；D11 与 seed 短 id 一致 |
| Scope | 单垂直切片可一 plan 三执行者；未混入 S03/S04 |
| Ambiguity | R1–R10 消除 mention 协议、乐观更新边界、排序、七态、描述 MD、dev.db 流程等歧义 |

---

## 13. 下一步

1. 用户复核本 spec  
2. 通过后 writing-plans → `docs/superpowers/plans/2026-07-09-s02-issue-detail.md`  
3. 开分支 `feat/s02-issue-detail`，按 impl-1 → 2 → 3 执行  
