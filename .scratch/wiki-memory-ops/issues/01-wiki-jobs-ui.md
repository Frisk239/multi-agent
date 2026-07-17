# 01 — Wiki jobs API 客户端 + DLQ UI + 重试

**What to build:** web hooks 接 `GET/POST /api/wiki/jobs`；`/wiki` 上 jobs 列表（默认可看 dead）、lastError、重试；轻量失败分类；键缺失/dead 横幅链 Settings。

**Blocked by:** None  

**Status:** resolved  

**Branch:** `feat/wiki-memory-ops`

## Acceptance

- [x] `useWikiJobs({ status? })` / `useRetryWikiJob` 在 `web/lib/api.ts`
- [x] Wiki 页展示 jobs 表：status、issue 链、failCount、lastError 摘要、时间
- [x] `dead` 行可「重试」→ 201/200 后列表刷新；非 dead 不提供假按钮
- [x] `classifyWikiIngestFailure`（shared）至少识别 key 缺失 vs generic
- [x] Wiki LLM 未配置或存在 dead 时有可行动提示 → `/settings`
- [x] typecheck 绿；jobs list/retry smoke 证据可写 progress
- [x] 不 push main；不 commit `wiki/` `*.db`

## Implementation notes

- 复用 `routes/wiki.ts` jobs；少改 server。  
- UI 风格对齐 `RunsPage` / `WikiHealthPanel` 表格。  
- 排序：客户端新→旧即可。

## Comments

（执行者）
