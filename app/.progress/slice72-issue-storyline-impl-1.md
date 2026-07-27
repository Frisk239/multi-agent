# Slice 72 · Issue 合并故事线 · impl-1

## 钉死决策

| 项 | 值 |
|---|---|
| merge | 客户端纯函数 `mergeIssueStoryline(comments, activities, runs?)` |
| 路径 | `packages/web/lib/issue-storyline.ts` |
| 排序 | `createdAt` **升序**（故事线阅读序）；同刻 comment < activity < run |
| StorylineItem | `kind: 'comment' \| 'activity' \| 'run'` + `id` + `createdAt` + payload 摘要 |
| 去重 | `comment_created` 且 `payload.commentId` 已在 comments → **跳过**该 activity |
| UI tabs | **故事线（默认）** \| 评论 \| 活动事件流 |
| Sheet | **也默认故事线** + 评论 tab；无「活动事件流」tab（省空间） |
| run 行 | page：点开 → `setSelectedRunId` + `timelineOpen` → 既有 `RunEventTimelineDrawer`；sheet：不挂 drawer 点击 |
| testid | `issue-storyline` / `storyline-item` / `activity-tab-storyline` / `issue-storyline-empty` |
| Out | 后端 merge API · tool 全文进故事线 · 推翻 Run 执行区 |

## 改动文件

| 路径 | 作用 |
|---|---|
| `packages/web/lib/issue-storyline.ts` | merge 纯函数 + `StorylineItem` |
| `packages/web/lib/issue-storyline.test.ts` | unit：排序 / 去重 / 空输入 / run payload |
| `packages/web/components/IssueStoryline.tsx` | 故事线列表 UI（可注入数据或 hooks） |
| `packages/web/components/IssueDetail.tsx` | 三 tab；sheet 默认故事线；run 锚点开 drawer |
| `packages/web/components/IssueDetail.test.tsx` | 默认 tab + sheet 故事线 |
| `packages/web/components/IssueDetail.error.test.tsx` | mock `useActivities` / IssueStoryline |
| `packages/web/app/globals.css` | `.issue-storyline*` / `.storyline-item*` |
| `packages/server/scripts/e2e-slice72-issue-storyline.mts` | unit 内联 merge + Playwright mock/UI |

## merge 规则（短）

1. 映射 comments → `kind=comment`
2. activities：若 `eventType=comment_created` 且 payload `commentId`/`comment_id` 命中 comments 集合 → **跳过**
3. runs → `kind=run` 锚点（`runId/status/error/runtime`）
4. 按 `createdAt` 升序；同分 `comment < activity < run` 再 `id`

## 自测（已跑）

```text
web tsc --noEmit                              # clean
vitest lib/issue-storyline + IssueDetail*     # 11 PASS
e2e-slice72-issue-storyline.mts               # unit 4 PASS；UI mock 7 PASS（SERVER 不可达 WARN create）
```

## 偏离 / 债

- sheet 保留「评论」tab；活动事件流仅 page（与旧 slice36「sheet 无 activity-tab-log」一致）
- run 锚点 sheet 不打开 drawer（drawer 本就 page-only）
- `comment_created` 目前服务端可能未写 activity；去重单测已钉，未来有写入时自动生效
- e2e 无服时 route-mock 验 UI；有 SERVER 时会真造 issue/comment/patch
- 未 commit / 未 push

## 残留

- 无后端 merge
- activity 中 run_* 与 run 锚点可能双显（有意：activity 事件 + run 实体锚点；后续可按 runId 再折叠）
