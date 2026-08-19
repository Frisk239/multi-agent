# Closeout: runs-mission-control-subjects

日期：2026-08-19

## 交付

- 实现提交：`20b4ae9 feat(runs): add mission control task search`
- `/api/runs` 现在以固定 SQL left join 投影 `subject`：Issue（编号、标题）、chat（标题）和有效项目；不再要求 Web 从 80 条结果里猜任务语义。
- 支持服务端 `q` 和 `projectId`：有效项目优先级为 Issue → chat thread → standalone run；列表、`total`、createdAt DESC 分页共用过滤条件。
- `/runs` 支持可分享的 `?q=&project=`、250ms replace debounce、项目筛选/chip/clear、列表锚点隔离；主文本显示 `ISS-42 · 标题` 或会话标题。

## 决策

- 对齐 Multica 的执行记录任务语义优先级：`references/repos/multica/packages/views/issues/components/execution-log-section.tsx:178-220,365-423`。
- SQLite 搜索固定为 ASCII 不分大小写、中文 Unicode 字面子串；`%`、`_`、反斜杠均被 LIKE literal escape。它不是拼音或全文搜索。
- `AgentRun.subject` 对旧 event / detail wire 保持可选；`GET /api/runs` 始终返回三项 subject 键，丢失关联时为 null。

## 证据

- `pnpm --filter @ma/shared exec vitest run --config vitest.config.ts src/schema.test.ts`：51 passed。
- `pnpm --filter @ma/server exec vitest run --config vitest.config.ts src/routes/runs.subjects.contract.test.ts`：3 passed（真实 SQLite：Issue/chat/QC/无命中、q/project/交集、排序/total、LIKE 转义）。
- `pnpm check`：通过（shared 6 files / 126 tests；server 120 files / 1035 tests；web 71 files / 501 tests）。
- `node scripts/check-docs.mjs`：通过（7 entries，7 ADRs，CI freeze）。
- 隔离 current-source Server `:3002` + Next `:3003` + 临时 DB 的 Playwright：`pnpm exec tsx scripts/e2e-runs-mission-control-subjects.mts` 通过。实测搜索、主文本、project chip、Issue/chat nested Link、回退 URL、run 锚点与零结果文案。

## 债 / 边界

- 原有 `withAutoRetrySummary` / path-lock 读取 enrich 仍可能按行查询；本刀没有为 subject 新增 N+1，但也不把旧债误报为已消除。
- 不做 transcript / quick prompt 全文搜索、拼音搜索、FTS 或跨工作区搜索。

## 给下一 Owner

- 下一刀取 P2 `issue-runs-truthful-error-state`：Issue 工作面中 `/api/runs` 加载失败必须显示局部错误 + retry，绝不能伪装为「指派 agent 后自动执行」。
- P1 Chat 标题编辑 / 归档后删除仍候选；实现前先固定含历史 chat run 的删除策略（默认建议拒绝硬删以保留可观察性）。
