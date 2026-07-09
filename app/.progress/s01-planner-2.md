# Handoff: S01-planner-2（切片总结 + 收尾）

> 切片：`S01` · 角色：`planner` · 序号：`2`（切片收尾）
> 日期：2026-07-09
> 作者：S01 计划者主会话

## 上下文

S01（看板 + WebSocket）是平台第一个垂直切片。本文件是切片验收通过后的**计划者收尾总结**——记录切片成果、偏离处置、FRI-11 路径点亮状态、给 S02 的交接。

切片全流程：spec（`24bfdf7`）→ 自审修订 R1-R5（`7b839d0`）→ 实现计划（`1dbd134`）→ 计划者 handoff（`5a2f6d2`）→ impl-1 契约层 → 计划者验收 → impl-2 server → 计划者验收 → impl-3 web+验收 → **本文件**。

## S01 切片验收结论：✅ 通过

### 验收清单（spec §9 逐条）

**§9.1 工程门槛**
- [x] `pnpm install` 无错
- [x] `pnpm -r typecheck` 三包全绿（shared + server + web）
- [x] `pnpm dev` server:3001 + web:3000 双端口 200

**§9.2 功能验收**
- [x] 六列看板，数据来自 SQLite（非 mock）
- [x] FRI-04~FRI-11 全显示，FRI-11 在 In Review
- [x] Backlog=FRI-08/04，Done=FRI-06/10，状态映射正确
- [x] Blocked 列存在 + 列头橙色点（#f97316，补的 --status-blocked 生效）
- [x] 新建得 FRI-12 浮顶 backlog

**§9.3 实时同步（核心验收画面）**
- [x] **双窗口：A 新建 → B 实时看到**
- [x] **双窗口：A 拖卡片 → B 实时移动**
- [x] WS 回声幂等（R4）
- [x] 拖拽后重启 server，DB 为真相源
- [ ] ⚠️ WS 断开乐观更新（D12，未实现，不阻塞核心）

### 切片统计
- 15 个 commit（impl-1×3 + 计划者验收×2 + impl-2×6 + impl-3×4）
- 3 个执行者会话（契约层 / server / web）
- 计划者会话介入 2 次（验收 impl-1、impl-2）
- 偏离：impl-1 补 typescript devDep（计划矛盾）；impl-2 修复 9 处计划代码 bug（3 处 ★ 实质）；impl-3 发现乐观更新缺口（计划代码矛盾）

## 本切片计划者完成了什么（收尾）

1. **3 次执行者验收**：impl-1（契约层）、impl-2（server，含 API/WS 契约逐条核对）、impl-3（web + 双窗口验收）
2. **偏离裁定 + 文档回写**：
   - ★1 better-sqlite3 11→12：回写 spec §2 + 计划 package.json（Node 24 硬约束）
   - ★5 drizzle 0.33 `.sync()`：回写计划 Task 2.2 代码（计划 bug）
   - ★9 SUBSTR(4)→(5)：回写计划 Task 2.4 代码（off-by-one）
   - D11 UUID 冲突：记入 spec §8.2，S01 不阻塞，建议 S02 放宽 schema
   - D12 乐观更新：记入 spec §8.2，留 S02+
3. **切片总结**（本文件）

## FRI-11 答辩路径点亮状态

| 路径段 | S01 状态 |
|---|---|
| 看板显示 FRI-11（In Review 列）| ✅ 点亮 |
| 时间线 + 评论 | ⬜ S02 |
| 真实 agent 执行 | ⬜ S03 |
| 小队 briefing + @mention 委派 | ⬜ S04 |
| Skill + MCP | ⬜ S05 |

**S01 点亮了看板部分。** 答辩路径现在是：打开 localhost:3000 → 六列看板 → FRI-11 在 In Review（指派产品小队，label 显示"产品小队"）。

## 给 S02 切片的交接注意点

> S02 = Issue 详情 + 时间线 + 评论 + @mention pill 渲染（见 design/slices.md）

S01 给 S02 留下的地基和待办：

### 地基（可直接复用）
1. **monorepo + shared 契约 + server + web 全栈已就位**。S02 在 `feat/s02-*` 分支继续。
2. **Issue CRUD API 完整**：GET/POST/PUT。S02 加 comment 表 + GET/POST comment API。
3. **WS 三跳基础设施可复用**：EventBus + WsBroadcaster 已通。S02 的 comment:created/comment:updated 事件直接走同一管线。
4. **设计 token 全量在 globals.css**，S02 详情页直接用。
5. **React Query + WS 幂等模式**已在 ws.ts 建立，S02 照搬。

### S02 必须处理的 S01 遗留
1. **D11 UUID 冲突**（优先）：S02 若要让详情页编辑 assignee，必须先解决——建议放宽 shared schema 的 `Assignee.id`/`Issue.id` 等为 `z.string()`（业务 id 用短标识符），而非改 seed。这要起会话定。
2. **D12 乐观更新**：S02 详情页的状态变更按钮也需要乐观更新，届时在 `useUpdateIssue` 加 `onMutate` + `onError` 回滚，一并解决看板拖拽的遗留。
3. **UpdateIssueInput 不含 assignee**：S02 若加指派 UI，需放开 schema + PUT 路由（当前 spec D 偏离标注"留给 S02+"）。

### S02 新建表（S01 未建，照 multica）
- `comment`（照 multica `001_init.up.sql:97-107`：author_type/author_id 多态 + `type IN (comment, status_change, progress_update, system)` + body 含 `mention://agent/<id>`）
- 不建 inbox_item / agent_task_queue（那些更晚）

## 验收结论

- [x] typecheck 通过（3 包全绿）
- [x] `pnpm dev` 能跑（双端口 200）
- [x] 切片验收标准达成（§9.2 功能 + §9.3 实时同步核心全 ✅，仅 D12 乐观更新 ⚠️ 留 S02）
- 结论：**S01 切片达标，可合并 main。** FRI-11 看板路径点亮。

## 合并后建议

1. 按 AGENTS.md 单人 PR 规则，开 PR 让**新会话**审 diff（无上下文偏见更能发现接口不一致/边界遗漏）
2. 审查通过 → 人在 main 合并（普通 merge，保留分支历史）
3. 合并后 `feat/s01-kanban-ws` 可删
4. S02 起会话时，读本文件 + `s01-impl-3.md` 作为前置上下文
