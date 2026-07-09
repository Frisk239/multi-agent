# Handoff: S02-impl-2

> 切片：`S02` · 角色：`impl` · 序号：`2`
> 日期：2026-07-09
> 分支：`feat/s02-issue-detail`

## 上下文（给下一个会话读）

S02 = Issue 详情 + 时间线 + 评论。本会话是 **impl-2（server API + status_change 事务 + roster）**，不写前端、不改 shared/schema。

前置：
- [`s02-impl-1.md`](s02-impl-1.md)（契约 + comment 表 + seed + toComment，计划者验收通过）
- Spec：`docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md` §5、§6、§3.6
- Plan：`docs/superpowers/plans/2026-07-09-s02-issue-detail.md` 执行者片段 B

下一切：impl-3（web 详情页 + Timeline/MD/pill + @ 补全 + D12 + WS）

## 本会话完成了什么

- [x] **Task 2.1** `routes/comments.ts` GET/POST · `routes/roster.ts` GET agents/squads · `app.ts` 注册
- [x] **Task 2.2** `GET /api/issues/:id`（共用 `toIssue`）· PUT 同事务写 `status_change` + 双事件 `issue:updated` + `comment:created`
- [x] **Task 2.3** API 自测 + 本 handoff

## 自测结果

### typecheck

```
$ cd app && pnpm --filter @ma/server typecheck
> @ma/server@0.0.0 typecheck
> tsc --noEmit
# exit 0
```

### DB 重置

```
$ Remove-Item packages/server/dev.db*
$ pnpm --filter @ma/server db:migrate
✓ 迁移完成
$ pnpm --filter @ma/server db:seed
✓ seed 完成：8 条 issue，6 条 comment
```

### API 自测（server :3001，PowerShell Invoke-RestMethod）

FRI-11 id（本次 seed）：`83bcf69a-bad1-4ce8-bc05-9b7d92321137`

| # | 调用 | 结果 |
|---|---|---|
| 1 | GET `/api/issues` | 找到 FRI-11，status=`in_review` |
| 2 | GET `/api/issues/:id` | `identifier=FRI-11`，`assignee={type:squad,id:sqd-product,label:产品小队}` |
| 3 | GET `/api/issues/:id/comments` | **3** 条 seed：林远 / 产品·策划队长 / 产品·调研与洞察官 |
| 4 | POST `{"body":"impl-2 自测"}` | 201，`authorId=user-linyuan`，`authorLabel=林远` |
| 5 | PUT `{"status":"done"}` | status→`done`；再 GET comments **5** 条，末条 `type=status_change`，`body={"from":"in_review","to":"done"}` |
| 6 | GET `/api/agents` · `/api/squads` | agents **4** · squads **3** |

#### 关键响应摘要（UTF-8 实抓）

```json
// GET /api/issues/:id
{
  "id": "83bcf69a-bad1-4ce8-bc05-9b7d92321137",
  "identifier": "FRI-11",
  "status": "done",
  "assignee": { "type": "squad", "id": "sqd-product", "label": "产品小队" }
}

// POST comment 201
{
  "type": "comment",
  "authorType": "member",
  "authorId": "user-linyuan",
  "authorLabel": "林远",
  "body": "impl-2 自测"
}

// GET comments 末条（PUT 后）
{
  "type": "status_change",
  "authorId": "user-linyuan",
  "authorLabel": "林远",
  "body": "{\"from\":\"in_review\",\"to\":\"done\"}"
}

// GET /api/agents (4)
[
  { "id": "agt-lead", "name": "产品·策划队长" },
  { "id": "agt-research", "name": "产品·调研与洞察官" },
  { "id": "agt-prd", "name": "产品·需求与PRD官" },
  { "id": "agt-proto", "name": "产品·设计·原型官" }
]

// GET /api/squads (3)
[
  { "id": "sqd-product", "name": "产品小队" },
  { "id": "sqd-philosophy", "name": "哲学与人文研究小队" },
  { "id": "sqd-eco", "name": "生态研究团队" }
]
```

### WS（可选）

本会话未单独连 WS 客户端；`eventBus.publish({ type: 'comment:created' })` 已在 POST comment 与 PUT status_change 路径接线（`app.ts` 仍是 eventBus → wsBroadcaster）。impl-3 接详情页时再验双窗口。

## 与计划的偏离

无。按计划代码块落地；`orderBy(asc(createdAt), asc(id))` typecheck 通过；`LOCAL_MEMBER`/`USER_ID` 均为 `user-linyuan`。

## 遗留 / 给 impl-3 的注意点

1. **API base：** `http://localhost:3001/api`（REST）；WS：`ws://localhost:3001/ws`
2. **Comment 形状：** `{ id, issueId, type, authorType, authorId, authorLabel, body, createdAt }`——来自 `toComment`；`status_change` 的 `body` 是 **JSON 字符串** `{"from":"...","to":"..."}`，前端再格式化中文，不要当自由文本展示原文即可。
3. **WS 事件：**
   - `issue:updated`：`{ type, issue, statusChanged, prevStatus }`
   - `comment:created`：`{ type, comment: Comment }`——POST 评论 **或** PUT 写了 status_change 都会发
4. **D12：** 乐观更新**只改** Issue cache 字段（status 等）；**禁止**乐观插入 timeline 行；等 `comment:created` 或 `invalidate(['comments', id])`
5. **mention 语法（seed/composer）：** `[@显示名](mention://agent/<id>)` 或 `mention://squad/<id>`；@ 补全数据源 GET `/api/agents` + `/api/squads`（`{id,name}`）
6. **status_change author 恒 `user-linyuan`/林远**（R8），与谁拖拽无关
7. **GET comments 已按** `created_at ASC, id ASC`（R3）；前端勿再倒序除非产品改需求
8. **本地重置 DB：** 删 `app/packages/server/dev.db*` 再 migrate+seed（路径写对）
9. **本会话未做：** 任何 web/React、mention 入队、改 assignee、评论编辑删除
10. **分支继续：** 同一 `feat/s02-issue-detail`，不要从 main 新开

## 验收结论（仅计划者填）

> 验收人：S02 计划者 · 日期：2026-07-09 · 分支 tip：`151b660`  
> 方式：对照 handoff 自测表 + 读 `comments.ts` / `issues.ts` PUT 事务 / `roster.ts` / `app.ts` 注册

- [x] typecheck 通过（server tsc exit 0）
- [x] GET issue/:id / comments / agents / squads 行为正确（FRI-11 产品小队；comments≥3；agents 4 / squads 3）
- [x] POST comment author=林远；PUT status 真变写 status_change JSON + 双事件接线
- [x] handoff 完整、可交 impl-3

### 代码核对（计划者）
- `toIssue` / `toComment` 共用；LOCAL=`user-linyuan` ✅
- comments 排序 `asc(createdAt), asc(id)` ✅
- PUT：`sqlite.transaction` 内 update + 条件 insert status_change；事务外 `issue:updated` + 条件 `comment:created` ✅
- body `JSON.stringify({ from: prev.status, to: input.status })` ✅
- 范围：无 web 改动；WS 客户端联调留给 impl-3（合理）

**结论：impl-2 达标，可开 impl-3。**
