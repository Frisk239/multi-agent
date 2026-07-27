# Slice 40 · 运维叙事 + Select + Run 观测收口（U7）· closeout

> 2026-07-27 · impl-1

## 交付

| 路径 | 内容 |
|---|---|
| `SettingsPage.tsx` + `lib/settings-first-steps.ts` | 顶区「先做这 3 步」`settings-first-steps`；error→warn 最多 3；全 ok 正向文案；锚 `#settings-check-{id}` |
| `components/Select.tsx` | 共用 Select（`ma-select`） |
| `AssigneeSelect` / `NewIssueForm` / `IssueHeader` | 指派 + 优先级接入 Select |
| `SquadDetailPage` / `SquadsPage` | Leader 下拉换 Select |
| `RunEventTimeline.tsx` | 抽屉 body 近底才吸底（`chat-scroll`）；失败条 `run-event-drawer-failure` = classify + recovery 主 CTA |
| `WikiJobsPanel.tsx` | 裸「加载中…」→ `TableSkeleton` / `ErrorState` 三态 |
| tests + e2e 骨架 | `settings-first-steps.test`、`chat-scroll.test`、`e2e-slice40-ops-select-run.mts` |

## Must

1. ✅ Settings first-steps（跨 tab 顶区）
2. ✅ 共用 Select：指派 + 优先级（+ leader）
3. ✅ Run 抽屉吸底 + 失败叙事 CTA
4. ✅ Wiki jobs 三态
5. ✅ 无密钥 UI

## Out

- Settings 双栏大改 / 全站每个 select / TipTap / 密钥表单
