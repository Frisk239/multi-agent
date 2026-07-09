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

- [ ] typecheck 通过（impl-1 后由 impl-1 自测）
- [ ] `pnpm dev` 能跑（impl-2 后）
- [ ] 切片验收标准达成（impl-3 后）
- 结论：**计划阶段完成，移交第一个执行者（impl-1）。**
