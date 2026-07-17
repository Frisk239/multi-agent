# Handoff: wiki-memory-ops-impl-1

> 切片：`wiki-memory-ops` · 角色：Slice Owner · 2026-07-17  
> 分支：`feat/wiki-memory-ops`

## 交付

票 01–03 同会话：Wiki jobs/DLQ UI + Memory 可行动 UX + D1 轻债。

### Wiki
- `useWikiJobs` / `useRetryWikiJob`（web）
- `WikiJobsPanel` 嵌 `/wiki`：默认筛 dead、lastError、分类、重试、Settings 横幅
- `classifyWikiIngestFailure`（shared）：`key_missing` / `generic`

### Memory
- provider 不可用横幅 + Settings
- 加载错误链 Settings；空匹配文案不与不可用混淆

### D1 轻债
- run-observability 票 Acceptance 全勾
- `/runs` QC「去快速派活」`?quickPrompt=`；Sidebar 打开 `QuickDispatchPanel` 预填并 `replace` 清 URL
- layout `Suspense` 包 Sidebar（`useSearchParams`）

## 证据

- `pnpm -r typecheck` 绿（shared/web/server）
- API smoke（临时 DB PORT=3041）：
  - `GET /api/wiki/jobs?status=dead` 200 含插入 dead
  - `POST .../retry` 200 → job 离开 dead（worker 可立即 claim 为 running）
  - wiki/pages · memory · settings/status · issues · runs 200
  - `classifyWikiIngestFailure('WIKI_LLM_API_KEY 未配置')` → `key_missing`

## 偏离

- 无功能偏离。retry 后 status 可能是 `pending` 或已被 worker 收成 `running`（竞态，属正常）。

## 未做 / 债

- 未浏览器手点全路径；人评：`/wiki` dead 表、`/memory` 横幅、`/runs` 去快速派活预填
- 未改 jobs 服务端排序（客户端新→旧）
- 无 key 时 retry 仍可能再 dead（预期）

## 下一步（人）

1. `git push -u origin feat/wiki-memory-ops`（若本会话已 push 则跳过）  
2. CI + 分支 `/code-review` vs `origin/main`  
3. 远程合并 main  
4. 勿 commit `wiki/` `*.db` `.tmp-*` `app/packages/server/wiki/`
