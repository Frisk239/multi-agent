# Handoff: s12-impl-2

> 切片：`S12` · 角色：`impl` · 序号：`2`
> 日期：2026-07-17

## 上下文（给下一个会话读）

S12 产品硬化厚切片最后一棒（片段 B：Squads + Inbox + 联调）。

- spec：`docs/superpowers/specs/2026-07-17-s12-product-hardening-design.md` §6/§7/§11
- plan：`docs/superpowers/plans/2026-07-17-s12-product-hardening.md` 片段 B
- 前序：`app/.progress/s12-impl-1.md`（Chrome + progress + B4/B5 + InboxItem）
- 分支：`feat/s12-product-hardening`
- worktree：`.worktrees/s12-product-hardening`
- 基线：计划者验收 impl-1 的 `b3e779d`

## 本会话完成了什么

### Task 2.1 — GET /api/squads/:id
- `server/routes/roster.ts`：`loadSquadDetail(id)`，不存在 → **404** `{ error: 'squad 不存在' }`
- commit：`3ca2825 feat(s12): GET /api/squads/:id`

### Task 2.2 — Squads UI
- `useSquad(id)` in `web/lib/api.ts`
- `SquadsPage` + `/squads`：列表链详情
- `SquadDetailPage` + `/squads/[id]`：operatingProtocol / missionDirective / members（只读；leader/成员可点 agent）
- commit：`7a1d650 feat(s12): Squads list and detail pages`

### Task 2.3 — GET /api/inbox
- 新 `server/routes/inbox.ts` + `app.ts` 注册
- 算法：最近 `limit`（默认 50）comments + 终态 runs（completed/failed）→ 批量 issue 元数据 → merge 按 `createdAt` 降序截断
- comment summary：`{authorLabel}: {body≤120}`；run：`Run {status} · {runtime}` + 可选 error
- id：`comment:{id}` / `run:{id}`
- commit：`2757850 feat(s12): synthetic GET /api/inbox`

### Task 2.4 — Inbox UI + 导航
- `InboxPage` + `/inbox`：kind 标签 + summary + issue identifier + 相对时间；点击 → `/issues/[id]`
- `Sidebar` NAV 加 `/inbox`、`/squads`
- `CommandPalette` 加对应导航项
- `globals.css`：inbox 列表 + squad 详情样式
- commit：`7fc05be feat(s12): Inbox page + nav to inbox/squads`

### Task 2.5 — 联调 / 本 handoff
- typecheck 全绿
- API smoke（本 worktree server `PORT=3012`，本地 migrate+seed）
- 未提交 e2e 框架；未 commit `wiki/` 运行目录

## 自测结果

```
$ pnpm -r typecheck
# shared / server / web 均 Done（全绿）

# API smoke @ http://127.0.0.1:3012
GET /api/squads → 3 条（产品/哲学/生态）
GET /api/squads/sqd-product → 200，leader=agt-lead，members=3，protocol/directive 非空
GET /api/squads/no-such → 404 {"error":"squad 不存在"}
GET /api/inbox → seed 后 6 条 comment；POST 评论后 7 条，top=「林远: S12 inbox smoke comment」
GET /api/runs（无 issueId）→ 400（B5 回归）
GET /api/issues → 200
GET /api/wiki/pages → 200
POST /api/issues + assignee agent → FRI-12 创建成功（指派回归）
```

UI 手验建议（人评 / playwright-cli 可选）：

1. worktree：`app` 下 server `PORT=3001` + web `3000`（或分端口；web `api.ts` 默认 `localhost:3001`）
2. 侧栏 Inbox / 小队 可进
3. Ctrl+K → Inbox / 小队 / 新建 Issue
4. 小队详情见 protocol / members
5. 评论后 Inbox 出现条目，点击进 Issue
6. 新建带指派仍 toast；WS 芯片 / progress 不回归

## 与计划的偏离

| 点 | 说明 |
|---|---|
| Inbox 含 status_change | 合成取全部 comment 表行（含 status_change 类型）；spec 写「最近 comment」，未排除 status_change。若产品只要 member 正文可再滤 `type=comment` |
| 列表 commits 拆 4 个 | 按 plan task 粒度：API squad / API inbox / UI squads / UI inbox+nav |
| 未跑完整 monorepo `pnpm dev` 同端口 UI 点验 | 机器上 3001 已是旧进程（无本棒路由）；改用 3012 做 API 验收。Web 页代码已挂路由 |

## 遗留 / 计划者要注意的点

1. **读本 handoff + 切片验收 §11**，全切片可开 PR。
2. 审查 diff 重点：`roster` 404 形状、`inbox` merge/limit、侧栏/CmdK 与 impl-1 诚实导航一致、`useSquad`/`useInbox`。
3. 勿 commit `app/packages/server/wiki/`；不 push main。
4. Create/指派仍会 enqueue——本机无 CLI 时 run 可能 failed，Inbox 应能出现 `run_failed`（有终态数据时）。
5. 人评 UI 时请用 **本分支** 起的 web，不要用仍跑旧 NAV 的 Next 进程。

## 验收结论（仅计划者填）

- [x] typecheck 通过（impl-2 自测）
- [x] Squads 列表/详情 API+页代码在位
- [x] Inbox 合成 API+页；NAV/Ctrl+K 已接
- [x] 回归：B5 400、issues/wiki 200、指派创建
- [ ] 人评浏览器路径 + 全切片 PR 审查 — 待计划者
- 结论：impl-2 交付完成，可计划者验收 / 开 PR 合 main。
