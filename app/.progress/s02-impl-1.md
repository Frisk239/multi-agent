# Handoff: S02-impl-1

> 切片：`S02` · 角色：`impl` · 序号：`1`
> 日期：2026-07-09
> 分支：`feat/s02-issue-detail`

## 上下文（给下一个会话读）

S02 = Issue 详情 + 时间线 + 评论。本会话是 **impl-1（契约层 + DB + seed）**，不写 API、不写前端。

前置：
- [`s02-planner-1.md`](s02-planner-1.md)（计划者开片注意点）
- [`s01-planner-2.md`](s01-planner-2.md)（D11/D12 遗留）
- Spec：`docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md` §2–§4
- Plan：`docs/superpowers/plans/2026-07-09-s02-issue-detail.md` 执行者片段 A

下一切：impl-2（server API：GET issue / comments / agents|squads / PUT status_change 事务）

## 本会话完成了什么

- [x] **Task 1.1** 从最新 `main`（`ac1b216`）建分支 `feat/s02-issue-detail`
- [x] **Task 1.2** shared：`BusinessId = z.string().min(1)` 消灭业务字段 `uuid()`；Comment / TimelineItem / StatusChangeBody / CreateCommentInput / AgentSummary / SquadSummary；`comment:created` 并入 `DomainEvent`
- [x] **Task 1.3** Drizzle `comments` 表（SQLite 表名 `comment`）+ additive migration `0001_early_centennial.sql`
- [x] **Task 1.4** `resolveAuthorLabel`（client.ts）+ `toComment`（reshape.ts）+ seed 6 条评论（按 `identifier` 查找 issue 再 insert）
- [x] **Task 1.5** 本 handoff

## 自测结果

### typecheck（三包全绿）

```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
packages/server typecheck$ tsc --noEmit
packages/web typecheck$ tsc --noEmit
packages/web typecheck: Done
packages/server typecheck: Done
# exit 0
```

### uuid 残留

```
$ 搜索 packages/shared 内 z.string().uuid / .uuid(
# 无匹配
```

### migrate + seed

```
$ Remove-Item packages/server/dev.db*
$ pnpm --filter @ma/server db:migrate
✓ 迁移完成

$ pnpm --filter @ma/server db:seed
✓ seed 完成：8 条 issue，6 条 comment
```

### SQLite 抽查

```
total: { n: 6 }
[
  { identifier: 'FRI-10', type: 'comment', author_type: 'agent', author_id: 'agt-research' },
  { identifier: 'FRI-11', type: 'comment', author_type: 'member', author_id: 'user-linyuan' },
  { identifier: 'FRI-11', type: 'comment', author_type: 'agent', author_id: 'agt-lead' },
  { identifier: 'FRI-11', type: 'comment', author_type: 'agent', author_id: 'agt-research' },
  { identifier: 'FRI-09', type: 'comment', author_type: 'member', author_id: 'user-linyuan' },
  { identifier: 'FRI-09', type: 'comment', author_type: 'agent', author_id: 'agt-prd' }
]
FRI-11 comment: { n: 3 }   ← 达标（≥3）
```

## 与计划的偏离

无（计划代码块与运行时 drizzle 0.33 / Zod 兼容；reshape 采用 S01 现网写法 `import { issues, comments } from './schema.js'` 而非计划里的 `import type`）。

## 遗留 / 给 impl-2 的注意点

1. **`toComment` 路径：** `app/packages/server/src/db/reshape.ts` → `toComment(row)`；依赖 `resolveAuthorLabel` 在 `client.ts`。
2. **`resolveAuthorLabel`：** `member` 查 `users`，`agent` 查 `agents`；找不到返回 `id` 本身（与 assignee 的「未知*」文案不同，按计划字面）。
3. **LOCAL_MEMBER 恒为 `user-linyuan` / 林远**——POST comment 与 PUT status_change 的 author 都用这个，禁止 `member-local`。
4. **migration 文件名：** `app/packages/server/drizzle/0001_early_centennial.sql`（drizzle-kit 生成名；表 `comment` + 索引 `idx_comment_issue_created`）。
5. **本地重置：** 必须删 **`packages/server/dev.db*`**（绝对路径），再 `db:migrate` → `db:seed`。相对 cwd 的 `Remove-Item dev.db*` 容易删错位置导致 UNIQUE 冲突。
6. **seed 条数：** 共 **6** 条 `type=comment`（FRI-11×3、FRI-10×1、FRI-09×2）。**无** status_change 历史（spec 故意不补造）。
7. **列表排序（R3）：** GET comments 需 `ORDER BY created_at ASC, id ASC`。
8. **status_change body：** `JSON.stringify({ from, to })`（IssueStatus 枚举值），禁止自由中文。
9. **PUT 事务语义：** status 真变时同事务 insert status_change → publish `issue:updated` + `comment:created`（见 plan 片段 B）。
10. **本会话未做：** `routes/comments.ts` / `roster.ts` / GET `:id` / PUT 改写 / web 任何改动。

## 验收结论（仅计划者填）

- [ ] typecheck 通过
- [ ] seed 后 FRI-11 ≥ 3 条 comment
- [ ] BusinessId 已清 uuid；migration additive
- [ ] handoff 完整、可交 impl-2
- 结论：
