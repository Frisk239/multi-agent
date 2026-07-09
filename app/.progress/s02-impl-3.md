# Handoff: S02-impl-3

> 切片：`S02` · 角色：`impl` · 序号：`3`
> 日期：2026-07-09
> 分支：`feat/s02-issue-detail`

## 上下文（给下一个会话读）

S02 = Issue 详情 + 时间线 + 评论。本会话是 **impl-3（web 详情页 + Timeline/MD/pill + @ 补全 + D12 + WS + §9 浏览器验收）**。

前置：
- [`s02-impl-2.md`](s02-impl-2.md)（server API 已验收；10 条注意点）
- Spec：`docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md` §7、§9、§6.2
- Plan：`docs/superpowers/plans/2026-07-09-s02-issue-detail.md` 执行者片段 C

下一切：计划者验收 → PR → 合并 main（执行者**不**自行合 main / 开 PR）。

## 本会话完成了什么

- [x] **Task 3.1** `react-markdown` · `lib/api.ts` hooks（useIssue/useComments/useAgents/useSquads/useCreateComment + D12 `useUpdateIssue`）· `lib/ws.ts` 处理 `comment:created` + 更新 `['issue', id]`
- [x] **Task 3.2** `/issues/[id]` · IssueHeader / Timeline / TimelineItem / MarkdownBody / CommentComposer / IssueDetail · IssueCard 标题 Link · globals.css
- [x] **Task 3.3** `pnpm dev` 浏览器 §9 验收 · 本 handoff · push 分支
- [x] 联调修复（记偏离）：Next webpack `extensionAlias`；`urlTransform` 放行 `mention://`
- [x] **A** `sqlite.pragma('foreign_keys = ON')`（`db/client.ts`，WAL 后立刻）
- [x] **B** `LOCAL_MEMBER` 单点（`local-member.ts`；seed / issues / comments 共用）

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

### DB + dev

```
$ Remove-Item packages/server/dev.db*  # 先停占用 :3001 的进程
$ pnpm --filter @ma/server db:migrate
✓ 迁移完成
$ pnpm --filter @ma/server db:seed
✓ seed 完成：8 条 issue，6 条 comment
$ pnpm dev
# web :3000 · server :3001
```

本次 seed FRI-11 id：`25c79965-b1ee-4a98-8e23-b74e6e3876cd`

### §9 验收勾选

#### 9.1 工程

| 项 | 结果 | 证据 |
|---|---|---|
| `pnpm -r typecheck` 三包绿 | ✅ | 上表 exit 0 |
| `pnpm dev` 双端口 | ✅ | :3000 / :3001 Listen，HTTP 200 |

#### 9.2 功能

| 项 | 结果 | 证据 |
|---|---|---|
| 看板点 FRI-11 标题 → `/issues/<uuid>`，顶栏 FRI-11 | ✅ | URL `.../issues/25c79965-...`；`.issue-id`=FRI-11 |
| 描述 + 指派「产品小队」只读 | ✅ | 描述 pre-wrap；`指派：产品小队`；无编辑控件 |
| 时间线 ≥3 seed；队长条 MD 标题 + mention pill | ✅ | seed 3 条；`## Operating Protocol` → h2；4 个 `.mention-pill` |
| 发评论 → 作者「林远」 | ✅ | 「impl-3 验收评论 by 林远」author=林远 |
| 详情改状态 → 顶栏 + status_change | ✅ | select→Done；「林远 将状态从 In Review 改为 Done」 |
| 看板拖拽改状态 → 进详情可见 status_change | ✅ | 拖 FRI-04 Backlog→Done；详情「林远 将状态从 Backlog 改为 Done」 |
| `@` 补全 agent + squad，pill 正确 | ✅ | 菜单 4 agent + 3 小队；发送后 `span.mention-pill`=@产品小队 |
| 看板新建/拖拽回归 | ✅ | 新建 FRI-12「impl-3 看板新建回归」进 Backlog；拖拽见上 |

状态 select **七态全量**（R4）：`backlog/todo/in_progress/in_review/done/blocked/cancelled` ✅  
优先级/指派只读（R5）✅ · description 不跑 MD（R10）✅

#### 9.3 实时

| 项 | 结果 | 证据 |
|---|---|---|
| 双窗口同详情：A 发评论 → B 出现 | ✅ | 窗口 B 发「双窗口WS评论-from-B」→ 窗口 A 可见 |
| 双窗口：A 改状态 → B 顶栏 + 时间线 | ✅ | A: Done→In Progress；B: select=`in_progress` + status_change 句 |
| HTTP+WS 同 id 不双条 | ✅ | FRI-11 comments API 8 条 / unique ids 8；UI timeline 8 条无重复文本 |

### 计划者附加 A/B

| 项 | 结果 | 证据 |
|---|---|---|
| A `foreign_keys = ON` | ✅ | `client.ts` WAL 后 `pragma('foreign_keys = ON')`；临时库 `DB_PATH=_tmp_fk.db` migrate+seed 成功（8 issue / 6 comment） |
| B `LOCAL_MEMBER` 单点 | ✅ | `src/local-member.ts`；seed/issues/comments 无散落 `user-linyuan` 字面量（仅常量定义处） |
| B 运行时 author | ✅ | POST comment `authorId=user-linyuan`；PUT status_change 同 id（label 经 resolveAuthorLabel → 林远） |
| server typecheck | ✅ | `pnpm --filter @ma/server typecheck` exit 0 |

## 与计划的偏离

1. **`next.config.mjs` 增加 `webpack.resolve.extensionAlias`**  
   原因：详情页首次 **值导入** `@ma/shared`（`IssueStatus` / `StatusChangeBody`）时，Next 解析 `export * from './schema.js'` 失败（S01 仅 `import type` 被擦除故未暴露）。tsx/server 无此问题。  
   修复：`.js` → `['.ts','.tsx','.js','.jsx']`。属 web 最小修复，未改 shared 源码。

2. **`MarkdownBody` 增加 `urlTransform` 放行 `mention://`**  
   原因：`react-markdown@10` 的 `defaultUrlTransform` 会把非白名单协议清空，导致 `href=""`、pill 变普通 link。  
   修复：`mention://` 原样返回，其余走 `defaultUrlTransform`。计划代码块未写，属 R1 必需补丁。

3. **Next params：** 项目为 Next **14.2**，`params` 同步 `{ id: string }`，未用 Promise 形态。

4. **计划者附加 A/B（impl-3 顺手，非片段 C 正文）：**  
   - A：`foreign_keys = ON`  
   - B：`LOCAL_MEMBER = { id: 'user-linyuan', name: '林远' }` 单点；禁止 `member-local`  
   - 未做 FK 负向测试；未改 shared Zod

## 遗留 / 给计划者的注意点

1. **D11/D12：** D12 已在 `useUpdateIssue` onMutate 落地（只乐观 Issue 字段；不乐观插 timeline）。D11 由 impl-1 关闭，本会话无回归。
2. **可开 PR：** §9 工程/功能/实时核心项已过；A/B 已带上。建议计划者快速再点 FRI-11 + 双窗口后开 PR。
3. **UI 小瑕疵（非阻塞）：**
   - mention 菜单在长页面底部，未做绝对定位浮层（功能可用）
   - 详情页无单独 loading skeleton
4. **拖拽 vs 点标题：** 标题 `Link` + `draggable={false}` + `stopPropagation`；Playwright 对 article 拖拽可触发 status 更新（FRI-04 已验）。
5. **分支 tip：** push 后以 `git log -1` 为准（含 A/B commit）。
6. **重启 server：** A 的 pragma 仅对新连接生效；长驻 `pnpm dev` 若未 reload，需重启一次后 FK 才 enforce（tsx watch 改 `client.ts` 通常会自动重启）。

## 验收结论（仅计划者填）

- [ ] typecheck
- [ ] §9 功能
- [ ] §9 实时
- [ ] 可合并 main
- 结论：
