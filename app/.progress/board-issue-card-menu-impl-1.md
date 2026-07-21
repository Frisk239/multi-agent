# board-issue-card-menu-impl-1

## 目标
看板卡片管理对齐 Multica：右键 / ⋯ 菜单可改状态·优先级·负责人、复制链接、删除 issue。

## 参考（Multica 源码，非真站）
- `references/repos/multica/packages/views/issues/actions/issue-actions-menu-items.tsx` — 菜单项：Status / Priority / Assignee / Copy link / Delete
- `references/repos/multica/packages/views/issues/actions/issue-actions-context-menu.tsx` — 右键挂卡片
- `references/repos/multica/packages/views/issues/components/board-card.tsx` — `IssueActionsContextMenu` 包 card
- `references/repos/multica/server/internal/handler/issue.go` DeleteIssue — cancel tasks → hard delete → `issue:deleted`

## 本仓落地
### API
- `DELETE /api/issues/:id`：cancel active runs → 清 labels/subscribers/comments/inbox/wiki jobs → runs `issue_id=null` → delete issue → `issue:deleted`
- 子 issue：`parent_issue_id` 置 null（保留子卡，一层模型）

### Shared / WS
- `IssueDeletedEvent` + `DomainEvent` 联合
- 前端 `ws.ts` 从 issues 列表与 detail cache 移除

### UI
- `IssueCardMenu`：固定定位菜单；状态/优先级/负责人子面板；复制链接；打开详情；删除（confirm）
- `IssueCard` 外包 menu shell；hover 显 ⋯；右键同菜单
- CSS：`.issue-card-menu-*` 对齐 page-header-more 密度

### 有意不做（本刀）
- pin / start-due date / relations / workdir path（本地无对应产品面或 API）
- Multica singleton ContextMenu 性能优化（看板规模本地可接受 per-card shell）

## 验收
- [ ] 看板卡片 hover 出现 ⋯
- [ ] 右键 / ⋯ 可改状态、优先级（乐观 + PUT）
- [ ] 负责人子菜单指派 agent/squad/清空（带 confirm）
- [ ] 复制链接 toast
- [ ] 删除 confirm 后卡片消失；刷新不回来

## 决策
- 删除用 `window.confirm`（与 Agents/Squads/Memory 一致），未做独立 Modal
- 指派菜单简化 confirm（不全量 readiness 拦截；详情侧 AssigneeSelect 仍完整）
