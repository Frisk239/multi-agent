# S02 impl-2 启动提示词（复制下方代码块整段到新会话）

> 使用时机：`s02-impl-1.md` 已写完，且计划者验收通过（或用户明确说可开 impl-2）。  
> 仓库路径：`D:\code\multi-agent`  
> 分支：在 **`feat/s02-issue-detail`** 上继续（不要新开分支、不要回 main 开新分支）

---

```markdown
你是 S02 的 **impl-2 执行者**（不是计划者）。只做 **server API + status_change 事务 + roster**，不要写前端，不要回头大改 shared/schema（除非 typecheck 强迫的最小修复，并记偏离）。

## 仓库
- 路径：`D:\code\multi-agent`
- 工程模式：根目录 `AGENTS.md`；handoff：`app/.progress/`

## 开工前检查
```bash
cd D:/code/multi-agent
git fetch origin
git checkout feat/s02-issue-detail
git pull   # 若远程有 impl-1
git status
git log --oneline -8
```
确认：
- 当前分支是 `feat/s02-issue-detail`
- 已有 impl-1 相关 commit（shared Comment / comment 表 / seed）
- 已读 `app/.progress/s02-impl-1.md`（尤其是「给 impl-2 的注意点」）

若 impl-1 未完成或 handoff 不存在：**停下来告诉用户**，不要瞎做。

## 必读（按顺序）
1. `AGENTS.md`
2. `app/.progress/s02-impl-1.md`  ← 上一段交接（最重要）
3. `app/.progress/s02-planner-1.md`  ← 全局注意点
4. `docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md` **§5、§6、§3.6**
5. `docs/superpowers/plans/2026-07-09-s02-issue-detail.md`：
   - Global Constraints
   - **执行者片段 B（impl-2）Task 2.1 → 2.3**（含完整代码）

## 本会话范围（只做这些）
| Task | 内容 |
|------|------|
| 2.1 | `routes/comments.ts` GET/POST · `routes/roster.ts` GET agents/squads · `app.ts` 注册 |
| 2.2 | `GET /api/issues/:id` · `PUT` 同事务写 status_change + 双事件（issue:updated + comment:created） |
| 2.3 | curl/API 自测贴输出 · 写 `app/.progress/s02-impl-2.md` |

## 硬约束
1. **LOCAL_MEMBER = `user-linyuan`**（与 seed / impl-1 一致），禁止 `member-local`
2. status_change 的 `body` 必须是 **`JSON.stringify({ from, to })`**，禁止自由中文
3. 仅当 `input.status` 存在 **且** `!== prev.status` 时写 status_change
4. 列表排序：`created_at ASC, id ASC`（spec R3）
5. `GET :id` 与 list **共用 `toIssue`**（R6）
6. `authorLabel` 走 `toComment` → `resolveAuthorLabel`（impl-1 已做）
7. 工程只在 `feat/s02-issue-detail` 提交：`feat(s02):` / `docs(s02):`
8. 不动 `packages/web`、`references/repos/`、`chanpin/prototype/`
9. 计划代码与 drizzle/fastify 冲突：以 typecheck 为准，记偏离；**spec 语义优先**

## 明确不做
- 任何 web / React 组件
- 改 shared Zod（除非编译断了的最小修复）
- mention 入队、改 assignee、评论编辑删除
- 不要重写 seed 业务逻辑（除非发现 seed 缺表导致 API 挂）

## 本地 DB（若缺 comment 表）
```bash
cd D:/code/multi-agent/app/packages/server
Remove-Item -ErrorAction SilentlyContinue dev.db, dev.db-shm, dev.db-wal
cd D:/code/multi-agent/app
pnpm --filter @ma/server db:migrate
pnpm --filter @ma/server db:seed
```

## 自测清单（handoff 必须贴摘要）
启动：`pnpm --filter @ma/server dev`（:3001）

1. `GET /api/issues` → 取 FRI-11 的 `id`
2. `GET /api/issues/:id` → identifier=FRI-11，assignee.label 含产品小队
3. `GET /api/issues/:id/comments` → ≥3 条 seed
4. `POST /api/issues/:id/comments` body `{"body":"..."}` → 201，author 林远
5. `PUT /api/issues/:id` `{"status":"done"}` → 再 GET comments，多一条 `type=status_change`
6. `GET /api/agents` · `GET /api/squads` → 非空
7. `pnpm --filter @ma/server typecheck` 绿

## 完成定义（DoD）
1. 上述 API 自测通过，输出进 handoff
2. 已写并提交 `app/.progress/s02-impl-2.md`（模板见同目录 `_TEMPLATE.md`）
3. handoff 含 **给 impl-3 的注意点**（事件形状、query 路径、D12 不要乐观插 comment、base URL）
4. 停下来回报：commits、自测结果、handoff 路径
5. **不要**自行开始 impl-3

## 工作方式
严格按计划 Task 2.1→2.3 Step 执行；计划里有完整代码块。做完即停。
```

---

## 执行者应交 handoff 骨架 → `s02-impl-2.md`

```markdown
# Handoff: S02-impl-2

> 切片：S02 · 角色：impl · 序号：2
> 日期：YYYY-MM-DD
> 分支：feat/s02-issue-detail

## 上下文
S02 第二执行者：server API（issue 单条、comments、roster）+ PUT status_change 双事件。
前置：s02-impl-1.md。

## 本会话完成了什么
- [ ] GET /api/issues/:id
- [ ] GET/POST /api/issues/:id/comments
- [ ] GET /api/agents · /api/squads
- [ ] PUT 事务 status_change + issue:updated + comment:created
- [ ] app.ts 注册路由

## 自测结果
（贴 curl / Invoke-RestMethod 摘要 + typecheck）

## 与计划的偏离
- 无 / …

## 遗留 / 给 impl-3 的注意点
- API base: http://localhost:3001
- Comment 形状（含 authorLabel）
- WS: comment:created / issue:updated 字段
- D12：只乐观 Issue，不乐观插 timeline
- mention 语法: [@名](mention://agent|squad/<id>)
- status_change body 是 JSON 字符串
- Next params 是否 async：查 next 版本

## 验收结论（计划者填）
- [ ] typecheck
- [ ] API 自测
- [ ] handoff 完整
- 结论：
```
