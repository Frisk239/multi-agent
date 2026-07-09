# Handoff: S01-planner-1（计划者设计 + 第一个执行者交接）

> 切片：`S01` · 角色：`planner` · 序号：`1`
> 日期：2026-07-09
> 作者：S01 计划者主会话

## 上下文（给执行者读）

S01 是平台的第一个垂直切片——看板 + WebSocket。设计已完成并写入：

- **spec 真源：** [`docs/superpowers/specs/2026-07-08-s01-kanban-ws-design.md`](../../docs/superpowers/specs/2026-07-08-s01-kanban-ws-design.md)（11 章，经深度自审修复 R1-R5）
- **实现计划：** [`docs/superpowers/plans/2026-07-09-s01-kanban-ws.md`](../../docs/superpowers/plans/2026-07-09-s01-kanban-ws.md)（bite-sized TDD task）
- **数据模型真源：** multica `references/repos/multica/server/migrations/001_init.up.sql:52-72`（issue 7 态 schema）+ `chanpin/prototype/data/seed.js`
- **工程模式：** [AGENTS.md §工程模式](../../AGENTS.md)

**一句话验收：** `pnpm dev` → 六列看板真实数据 → 拖拽/新建实时同步 → 双窗口联动。

### 计划者做的关键决策（执行者必须知道）

1. **状态以 multica 源码为准，prototype 有遗漏。** issue.status 7 态（`backlog` 非 `planning`），看板六列含 Blocked，cancelled 留枚举不建列。prototype 不是规格真源——见 spec §8.2 偏离表 D1。
2. **技术栈：** Fastify + @fastify/websocket + Drizzle + better-sqlite3 + Next.js + React Query + Zustand + Zod。
3. **assignee 带 label 字段（R2 修订）。** DB 扁平存 type+id，API 嵌套返回 `{type,id,label}|null`，label 服务端用内存 map 填充。**这是为修复"卡片显示不出 assignee 名称"的契约断层而加的，不要漏。**
4. **执行者数量不固定。** 计划里 impl-1/impl-2/impl-3 是参考边界，按依赖（契约→后端→前端）切。

## 本会话（计划者）完成了什么

- 调研上下文：读 design/ 全部 + multica schema 源码 + seed.js + prototype 源码
- 澄清关键决策：状态枚举（六列）、后端框架（Fastify）、WS 库（ws）
- 产出 spec（11 章）+ 经 sequential thinking 深度自审修复 5 个问题（R1-R5）
- 产出实现计划（3 执行者片段 × bite-sized TDD task）
- 软化执行者边界为"参考片段"（呼应 AGENTS.md 计划者-执行者模式）

## 自测结果

计划者会话无工程代码产出，自测为文档完整性检查：

```
spec §1-§11 全部章节填充，无 TBD/TODO
R1-R5 五个自审问题已修复（见 spec §8.3）
计划 spec 覆盖自检通过（计划末尾）
三个文档已提交：24bfdf7（spec）→ 7b839d0（自审修订）→ 1dbd134（计划）
```

## 与计划的偏离

无。计划阶段。

## 遗留 / 给第一个执行者（impl-1）的注意点

> **impl-1 范围 = 计划的 Task 1.1 + 1.2 + 1.3**（monorepo 根 + shared 包 Zod 契约 + 写 impl-1 handoff）。这是契约层，所有人依赖的地基。

执行者读这份 handoff + spec §2/§3/§4 + 计划的"执行者片段 A"即可开工。关键注意点：

1. **先建 feature 分支 `feat/s01-kanban-ws`**，所有工程代码在此分支，绝不进 main。
2. **shared 包不构建，直接读 .ts 源码**——`package.json` 的 `main` 指向 `./src/index.ts`。server 用 tsx、web 用 `transpilePackages: ['@ma/shared']` 消费。
3. **相对 import 带 `.js` 扩展名**（ESM 规则，`moduleResolution: bundler` + `module: ESNext` 下）。
4. **`UpdateIssueInput` 的校验分两步**：先 `UpdateIssueInput.parse(body)`，再调独立的 `validateUpdateIssue(d)`（R1 修订，不用 Zod refine 链）。
5. **`CreateIssueInput.assignee` 输入是 `{type,id}|null`（无 label）**，但输出 `Issue.assignee` 是 `{type,id,label}|null`（R2）。label 服务端权威，客户端永不传 label。
6. **`crypto.randomUUID()`** 在 Node 24 是全局可用，seed 和 POST 都用它生成 PK id（注意 identifier 是固定的 FRI-xx，不是 id）。
7. **pnpm install 后若依赖版本锁到更新的 minor/patch**，以实际为准，在 impl-1 handoff 记录真实版本号。
8. **完成后必须写 `app/.progress/s01-impl-1.md`**（照 `_TEMPLATE.md`），给 impl-2 的注意点里要写清 shared 包的 import 路径和 `assignee` 输入/输出形态差异。

## 验收结论（仅计划者填）

- [x] typecheck 通过 —— **impl-1（shared）+ impl-2（server）全绿，计划者复核确认**
- [ ] `pnpm dev` 能跑（impl-3 建 web 后）
- [ ] 切片验收标准达成（impl-3 后）

### impl-1 验收（2026-07-09 计划者复核）

**结论：✅ 通过，移交 impl-2（server 全栈）。**

复核项：
- ✅ 分支 `feat/s01-kanban-ws`，3 commit（`72ea580` 骨架 / `69334c9` shared / `3ddb9ea` handoff），未碰 main
- ✅ 范围守得住——`app/packages/` 仅 shared，未越界建 server/web
- ✅ `schema.ts` 严格照 spec §4 + R1（`validateUpdateIssue` 独立函数）+ R2（`Assignee` 有 label，`CreateIssueInput.assignee` 输入无 label）
- ✅ handoff 完整：5 条给 impl-2 的注意点 + 1 处偏离（补 typescript devDep，属计划内部矛盾的合理修复）+ 真实依赖版本

**给 impl-2 的计划者补充注意点（impl-1 handoff 之外）：**

1. **dev script 暂时不全量可用**：根 `package.json` 的 `pnpm dev` 用 `--filter=@ma/server --filter=@ma/web`，但 web 还没建。impl-2 阶段用 `pnpm --filter @ma/server dev` 单独起 server 自测，不要直接 `pnpm dev`（会因 web 不存在而部分失败）。`pnpm -r typecheck` 此时只跑 shared+server，OK。
2. **label map 查询在 `db/client.ts`**（计划 Task 2.2 Step 1）——`resolveAssigneeLabel(type, id)` 是同步函数，读 better-sqlite3 同步 API。注意：label map 依赖 agent/squad/user 表已被 seed 填充，所以 **migrate + seed 必须在 server 首次启动前跑过**（计划 Task 2.2 Step 4 的 `db:generate && db:migrate && db:seed`）。在 `app/packages/server/` 目录下跑（dev.db 相对路径在那）。
3. **Drizzle 的 SQLite enum 是 TS 层约束**，SQLite 不强制 CHECK。S01 靠应用层 Zod 校验把关（CreateIssueInput/UpdateIssueInput 已挡），CHECK 约束不阻塞，可不做。
4. **`crypto.randomUUID()` 在 Node 24 全局可用**，但 server 的 tsconfig 要有 `types: ["node"]`（计划 Task 2.1 Step 2 已含），否则类型报错。
### impl-2 验收（2026-07-09 计划者复核）

**结论：✅ 通过，移交 impl-3（web 全栈 + 验收）。**

复核项（契约逐条核对，这是 impl-3 的命脉）：
- ✅ `toIssue` 正确填 label（R2），assignee null 时返回 null
- ✅ POST 只取 `assignee?.type/.id` 存 DB，不接 label（R2）
- ✅ `validateUpdateIssue` 在 PUT 单独调，空 body 返回 400（R1）
- ✅ identifier SUBSTR 已修成 5（★9 修复正确）
- ✅ statusChanged/prevStatus 逻辑正确（PUT :106-112）
- ✅ WS 三跳全通（route→eventBus→wsBroadcaster→client）
- ✅ GET 返回扁平数组，label 填充正确（FRI-05→"产品小队"）
- ✅ POST position=-1 浮顶 + identifier FRI-12
- ✅ DB 重置干净（8 条 seed，无测试残留）

**3 处 ★ 偏离的计划者裁定（全部接受 + 决定回写文档）：**

| 偏离 | 裁定 | 处置 |
|---|---|---|
| ★1 better-sqlite3 11→12.11.1 | ✅ 接受 | Node 24 无 prebuilt 是硬约束。回写 spec §2 技术选型表（`^12.0.0`）。这是真实正确版本 |
| ★5 drizzle 0.33 `.sync()` | ✅ 接受 | 计划代码 bug（`db.query.X.findFirst()` 返回 query builder，需 `.sync()` 触发）。回写计划 Task 2.2 代码 |
| ★9 SUBSTR(4)→(5) | ✅ 接受 | 计划代码 off-by-one（SQL 1-based，`FRI-` 4 字符，数字从第 5 位）。回写计划 Task 2.4 代码 |

> 文档回写由计划者在切片收尾后统一做（切片验收通过后），不阻塞 impl-3。

**新增偏离 D11（计划者发现）：seed id 非 UUID 与 schema UUID 契约冲突**
- 现象：seed 的 agent/squad id 是 `agt-lead`/`sqd-product`（短 ID），但 shared schema 的 `Assignee.id`/`Issue.id` 要求 `z.string().uuid()`。
- S01 影响：**不阻塞**。前端不 safeParse 返回值（直接用 fetch().json()），TS 的 uuid 推导类型只是 `string` 不窄化，typecheck 不报、运行时不报。
- 决策：**S01 保持现状不返工**。长期修正留 S02+（要么 seed 改 UUID，要么 schema 放宽为 `z.string()`）。记入 spec §8.2 偏离表。

**给 impl-3 的计划者补充注意点（impl-2 handoff 之外）：**

1. **web 内部相对 import 不带 `.js`**（impl-2 handoff 第 6 条已修正 impl-1 的说法——web 用 Next bundler，与 server 的纯 ESM 不同）。但 `@ma/shared` 仍用包名 import。
2. **`transpilePackages: ['@ma/shared']`** 必须在 `next.config.mjs`（计划 Task 3.1 Step 3），否则 web 读 shared 的 `.ts` 报错。
3. **D11 的实际影响**：新建表单（Task 3.3 NewIssueForm）传 `assignee: null` 即可，**不要**让表单选 seed agent/squad 作为 assignee（它们的 id 非 UUID 会被 POST 的 Zod 校验 400 拒——因为 `CreateIssueInput.assignee.id` 也要求 uuid）。S01 新建表单只做"标题+priority"，assignee 恒 null。这符合计划 Task 3.3 的代码（`create.mutate({ title, priority, assignee: null })`），照抄即可。
4. **验收前重置 DB**：impl-2 已重置成干净 8 条 seed。impl-3 验收时若新建了测试 issue，验收后跑一次 `pnpm --filter @ma/server db:seed`（会报重复？若 seed 脚本不是 upsert，先删 dev.db 再 migrate+seed）——**注意：seed.ts 当前不是幂等的**（直接 insert，重复跑会主键冲突）。impl-3 验收要新建测试数据没问题，但**最终合并前要确保 dev.db 是干净 8 条**（删 dev.db → migrate → seed）。这条提醒 impl-3 在 handoff 记录最终 DB 状态。


