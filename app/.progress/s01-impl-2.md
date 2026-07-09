# Handoff: S01-impl-2（server 全栈）

> 切片：`S01` · 角色：`impl` · 序号：`2`
> 日期：2026-07-09
> 作者：S01 执行者 2（impl-2）
> 分支：`feat/s01-kanban-ws`

## 上下文（给下一个会话读）

S01 是平台第一个垂直切片（看板 + WebSocket）。impl-1 完成了契约层（@ma/shared），本会话完成 **server 全栈**：Drizzle schema + seed + label map + EventBus/WsBroadcaster + Issue CRUD API + WS 路由 + Fastify 组装 + :3001 启动。

读 [AGENTS.md §工程模式](../../AGENTS.md) + [spec §3/§5/§6](../../docs/superpowers/specs/2026-07-08-s01-kanban-ws-design.md) + [计划执行者片段 C](../../docs/superpowers/plans/2026-07-09-s01-kanban-ws.md) + [s01-impl-1.md](./s01-impl-1.md)（shared 契约）+ [s01-planner-1.md](./s01-planner-1.md) + 本文件。

**impl-2 范围已完成**（Task 2.1~2.6）。下一个执行者（impl-3）做 web 全栈 + 切片验收（Task 3.x）。

## 本会话完成了什么

**Task 2.1 — server 脚手架 + Drizzle schema（commit `33dc8d2`）**
- `server/package.json`（@ma/server，scripts: dev/typecheck/db:generate/db:migrate/db:seed）
- `server/tsconfig.json`（继承 base，`types:["node"]`，`declaration:false`）
- `server/drizzle.config.ts`（drizzle-kit sqlite，dev.db）
- `server/src/db/schema.ts`（6 表：workspace/user/agent/squad/skill/issue，issue 14 列 2 索引 1 FK，照 multica 7 态）

**Task 2.2 — DB client + seed + label map（commit `2b6e6d4`）**
- `server/src/db/client.ts`：better-sqlite3 + drizzle 实例（WAL）+ `resolveAssigneeLabel(type,id)`（agent/squad/user → label 内存查询）
- `server/src/db/migrate.ts`：drizzle-kit 生成 SQL 的执行器
- `server/src/db/seed.ts`：workspace/user/4 agent/3 squad/5 skill + **8 条 FRI issue**（FRI-04~11，状态照 spec §3.4，position 全 0）
- `server/drizzle/0000_mute_bromley.sql`（迁移产物）

**Task 2.3 — EventBus + WsBroadcaster（commit `4231988`）**
- `orchestration/event-bus.ts`：同步 in-process 总线（on/off/publish，错误隔离）
- `orchestration/ws-broadcaster.ts`：`Set<WebSocket>`，broadcast 给所有 OPEN 连接（含发起者，spec §6.6）

**Task 2.4 — reshape + issue routes（commit `61312a4`）**
- `db/reshape.ts`：`toIssue(row)` DB 扁平行 → API 嵌套 Issue，**assignee 输出填 label**（R2）
- `routes/issues.ts`：GET（position ASC,created_at DESC）/ POST（算 identifier + 浮顶 position + publish）/ PUT（动态 SET，`validateUpdateIssue` 校验，publish issue:updated 含 statusChanged+prevStatus）

**Task 2.5 — WS route + app 组装 + 启动（commit `33e085e`）**
- `routes/ws.ts`：`GET /ws`（websocket:true，add→close 时 remove）
- `app.ts`：Fastify 组装（cors 允许 localhost:3000 + websocket + 接线 eventBus→wsBroadcaster + 注册路由）
- `index.ts`：`:3001` 启动

**Task 2.6 — 本 handoff**

## 自测结果

### 1. typecheck（全绿）
```
$ pnpm -r typecheck
Scope: 2 of 3 workspace projects
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
packages/server typecheck$ tsc --noEmit
packages/server typecheck: Done
```
（web 未建，2 of 3，符合预期）

### 2. db:generate / migrate / seed
```
$ pnpm db:generate  → 6 tables, issue 14 columns 2 indexes 1 fk, 生成 drizzle/0000_mute_bromley.sql
$ pnpm db:migrate   → ✓ 迁移完成
$ pnpm db:seed      → ✓ seed 完成：8 条 issue
```

### 3. curl GET /api/issues（label 填充生效，R2 验证通过）
8 条 issue 扁平数组，FRI-05 assignee `{"type":"squad","id":"sqd-product","label":"产品小队"}`，FRI-06 `{"type":"agent","id":"agt-proto","label":"产品·设计·原型官"}`，未指派 `"assignee":null`。

### 4. curl POST /api/issues（identifier 修复后正确）
```
POST {"title":"impl-2 selftest new","priority":"medium"}  (assignee 省略，默认 null)
→ 201 {"identifier":"FRI-12","status":"backlog","position":-1,"assignee":null,...}
```
position=-1 浮顶，FRI-12（max+1）。

### 5. curl PUT /api/issues/:id
```
PUT {"status":"todo"}  → 200 {"...","status":"todo","updatedAt":<变了>}
PUT {} (空)            → 400 {"error":"至少传一个字段"}   ← validateUpdateIssue 生效（R1）
```

### 6. WS 广播（三跳链路验证）
独立 node 脚本：连 `ws://localhost:3001/ws` → POST 触发 → 收到事件：
```
[ws] received event: {"type":"issue:created","issue":{"identifier":"FRI-13","status":"backlog",...}}
```
route→eventBus.publish→wsBroadcaster.broadcast→客户端，全链路通。

### 7. DB 最终状态（重置为干净 seed）
8 条：FRI-04/08 backlog、FRI-05/07 todo、FRI-06/10 done、FRI-09 in_progress、FRI-11 in_review。**dev.db 已重置干净**（测试残留 FRI-12/13 已清），impl-3 接手时是干净 8 条。

## 与计划的偏离

> 本会话遇到 **8 处计划代码/配置问题**，均属计划内部矛盾或 Windows 兼容性，已逐一修复并记录。其中 3 处需计划者知会（标记 ★）。

| # | 计划问题 | 性质 | 修复 |
|---|---|---|---|
| ★1 | **better-sqlite3 11.10 无 Node 24 prebuilt**，本机无 VS C++ 工具链无法源码编译 → server 完全无法起 | 环境阻塞（已用户决策） | better-sqlite3 升 **11→12.11.1**（12.x engines 官方支持 Node 24）|
| 2 | 计划 package.json 无 `@types/node`，但 server tsconfig 要 `types:["node"]`，typecheck 报找不到 node 类型 | 计划内部矛盾 | 补 `@types/node: ^20.0.0`（与计划 web 包一致）|
| 3 | pnpm 默认拦截 better-sqlite3 build 脚本，原生 binary 不编译 | 环境 | 根 package.json 加 `pnpm.onlyBuiltDependencies:["better-sqlite3"]` |
| 4 | tsconfig.base `declaration:true` + server 导出 `sqlite` 变量 → `TS4023 cannot be named` | 计划配置缺口 | server tsconfig 加 `declaration:false, declarationMap:false`（终端应用不发声明）|
| ★5 | **drizzle-orm 0.33 的 `db.query.X.findFirst()` 返回 query 对象需 `.sync()`**，计划 client.ts 直接取 `.name` → TS2339 | 计划代码 bug | `resolveAssigneeLabel` 3 处 findFirst 加 `.sync()`（**注：drizzle 0.33 的 `drizzle()` 不接受 `mode:'sync'` 参数，`BetterSQLite3Database` 已硬编码 sync，只能用 `.sync()` 方法**）|
| 6 | seed.ts 的 `seedIssues` 字面量被推断成宽 `string`，与 issues 表 enum insert 类型不匹配 → TS2769 | 计划代码 bug | 给 `seedIssues` 显式标注 `{status:IssueStatus, priority:Priority, assigneeType:AssigneeType\|null,...}` |
| 7 | migrate.ts 用 `new URL(...).pathname`，Windows 产生前导 `/`（`/D:/...`）→ existsSync 判不存在 | Windows 兼容 | 改 `fileURLToPath(new URL(...))` |
| 8 | ws-broadcaster.ts `import type {WebSocket} from 'ws'`，但 server package.json 无 ws 依赖 | 计划缺口 | 补 `ws: ^8.0.0` + `@types/ws: ^8.0.0`（对齐 @fastify/websocket 的 ws^8）|
| ★9 | **identifier 生成 SQL `SUBSTR(identifier,4)` off-by-one**：`FRI-11` 第4字符是 `-`，取到 `-11`→CAST -11，导致新建得 `FRI--3` 而非 `FRI-12` | 计划代码 bug | 改 `SUBSTR(identifier,5)`（1-based，跳过 `FRI-` 4 字符）|

> ★标记的 3 项（better-sqlite3 主版本升级、drizzle 0.33 sync API、identifier off-by-one）是实质修改，请计划者复核是否需要回写 spec/计划或同步给后续切片。

**真实依赖版本（计划 `^` 范围锁定的实际值）：**

| 包 | 计划 | 实际 | | 包 | 计划 | 实际 |
|---|---|---|---|---|---|---|
| fastify | ^4.28.0 | 4.29.1 | | @types/node | ^20.0.0(新) | 20.19.43 |
| @fastify/websocket | ^10.0.0 | 10.0.1 | | @types/better-sqlite3 | ^7.6.0 | 7.6.13 |
| @fastify/cors | ^9.0.0 | 9.0.1 | | @types/ws | ^8.0.0(新) | 8.18.1 |
| drizzle-orm | ^0.33.0 | 0.33.0 | | ws | ^8.0.0(新) | 8.21.0 |
| drizzle-kit | ^0.24.0 | 0.24.2 | | zod | ^3.23.0 | 3.25.76 |
| better-sqlite3 | ~~^11.0.0~~ | **12.11.1** | | typescript | ^5.5.0 | 5.9.3 |
| | | | | tsx | ^4.0.0 | 4.23.0 |

## 遗留 / 下一个执行者（impl-3）要注意的点

> 不是新计划，是接着干必须知道的坑/契约。**API + WS 契约逐字准确，照此实现前端。**

### 1. API 契约（base: `http://localhost:3001`）

| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/api/issues` | — | `Issue[]` 扁平数组（前端按 status 分组），按 `position ASC, created_at DESC` |
| POST | `/api/issues` | `{title:string, description?:string, priority?:Priority, assignee?:{type,id}\|null}` | `Issue`（201） |
| PUT | `/api/issues/:id` | `{title?, description?, status?, priority?, position?}` | `Issue`（200）；至少一个字段，否则 400 |

**Issue 形状（GET/POST/PUT 返回，逐字段）：**
```ts
{ id: string(uuid), workspaceId: string, identifier: string("FRI-11"),
  title: string, description: string|null, status: IssueStatus, priority: Priority,
  assignee: {type:"member"|"agent"|"squad", id:string, label:string}|null,  // ← label 服务端填，R2
  creatorType: "member"|"agent", creatorId: string,
  position: number, createdAt: string(iso), updatedAt: string(iso) }
```
- `createdAt/updatedAt` 是 ISO 字符串（`new Date(...).toISOString()`），DB 存 unix ms。

### 2. assignee 输入/输出形态（★最易踩坑）
- **输入**（POST body.assignee）：`{type, id} | null`，**无 label**。
- **输出**（Issue.assignee）：`{type, id, label} | null`，**label 服务端权威**。
- ⚠️ **契约不一致提醒**：shared schema 的 `assignee.id` 要求 `z.string().uuid()`，但 seed 的 agent/squad id 是 `agt-lead`/`sqd-product`（非 UUID）。所以**前端新建表单若要带 assignee，传 seed agent 的 id 会被 400 拒**。S01 的 NewIssueForm（计划 Task 3.3）传的是 `assignee: null`，不受影响。**但若 impl-3 想让新建表单可选指派，要么改 seed id 成 UUID，要么放宽 schema——建议 S01 保持 null，记入遗留给计划者。**

### 3. WS 契约
- URL：`ws://localhost:3001/ws`，无鉴权，连上即收全量 issue 事件。
- 事件类型（`DomainEvent` 联合，用 `type` 字段判别）：
  - `{"type":"issue:created", "issue":Issue}`
  - `{"type":"issue:updated", "issue":Issue, "statusChanged":boolean, "prevStatus":IssueStatus|null}`
- **广播含发起者**（spec §6.6）→ 前端事件处理**必须幂等**（spec §7.5 R4）：用 issue.id 在 cache 定位更新，相同状态 no-op（setQueryData 天然幂等）。

### 4. 端口 + CORS
- server :3001，web :3000
- CORS 已配允许 `http://localhost:3000`（`app.ts`），fetch 跨域 OK
- WS 无 CORS 限制

### 5. 运行方式（计划者注意点 1）
- **dev 暂不全量**：根 `pnpm dev` 用 `--filter=@ma/server --filter=@ma/web`，web 还没建会失败。impl-3 建 web 后 `pnpm dev` 才完整可用。
- 单独起 server：`pnpm --filter @ma/server dev`（在 app/ 下）
- DB 操作必须在 `app/packages/server/` 目录（dev.db 相对路径在那）

### 6. 给 impl-3 的工程约定
- 继续 `feat/s01-kanban-ws` 分支
- web 也用包名 import `@ma/shared`；web 内部相对 import 由 Next/bundler 处理，**不需要** `.js` 扩展（只有 server 的纯 ESM 需要，impl-1 handoff 说错了"server/web 都要"——web 用 Next 的 bundler，相对 import 不带 .js）
- shared 不构建，web 靠 `transpilePackages: ['@ma/shared']`（计划 Task 3.1 Step 3 已含）

## 验收结论（仅计划者填）

- [x] typecheck 通过 —— **impl-2 已验证 shared+server 全绿**
- [ ] `pnpm dev` 能跑（impl-3 建 web 后）
- [ ] 切片验收标准达成（impl-3 后）
- 结论：impl-2 范围（Task 2.1~2.6）完成，server 端到端自测全通过（GET/POST/PUT/WS）。3 处实质偏离（★）待计划者复核。移交 impl-3（web 全栈 + 验收）。
