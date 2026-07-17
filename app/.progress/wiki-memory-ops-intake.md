# Intake: wiki-memory-ops

> 下一 Slice Owner handoff-based 验收 · 2026-07-17  
> 上一刀：`wiki-memory-ops` · 交接：`app/.progress/wiki-memory-ops-impl-1.md`

## 结论

**有条件通过**

可进入下一刀短对齐 brainstorm。**无需返工**；下列债不挡产品日常路径，记入债即可。

## 合并 / 分支

| 项 | 状态 |
|---|---|
| `git fetch` | 已做 |
| `origin/main` | `d122cf0`（含 `Merge pull request #18 from Frisk239/feat/wiki-memory-ops`） |
| 功能合入 | **已合** — `048b57c feat: wiki jobs DLQ UI, memory ops UX, and D1 debt` |
| `048b57c` 是否 ancestor of `origin/main` | 是 |
| 本地 `feat/wiki-memory-ops` HEAD | `35c28b8`（合码后另有 3 条 docs-only：slice-owner skill 全局安装说明）— **未**进 main；不挡本刀功能验收 |
| 本会话 | **未** `git push origin main`；untracked 运行产物：`app/packages/server/wiki/`、`wiki/`（勿 commit） |

## 对照交接声称

impl-1 声称：票 01–03 同会话交付；Wiki jobs/DLQ UI + Memory 可行动 UX + D1 轻债；typecheck 绿；API smoke（dead list / retry / 回归 / classify）；偏离无功能点。

### 代码抽查（main / 工作区）

- `WikiJobsPanel` 嵌 `/wiki`：默认筛 `dead`；`lastError` + 分类；仅 dead「重试」；LLM 未配置或 dead>0 横幅 → Settings  
- `useWikiJobs` / `useRetryWikiJob` → 现有 `GET/POST /api/wiki/jobs`  
- `classifyWikiIngestFailure`（shared）：`key_missing` / `generic` + Settings 引导  
- Memory：`available === false` 横幅 + Settings；加载错误链 Settings；有查询无结果仍「没有匹配的记忆」  
- D1：`/runs` QC「去快速派活」`?quickPrompt=`；Sidebar 打开 `QuickDispatchPanel` 预填并清 URL；layout `Suspense`  
- feat 功能 commit 无 `wiki/` / `*.db` / 密钥路径

### 本会话复核证据

1. **`pnpm -r typecheck`**（`app/`）：shared / web / server **全绿**  
2. **API smoke**（临时 `DB_PATH` + PORT=3043，migrate+seed，插入 dead job）：

| 检查 | 结果 |
|---|---|
| `GET /api/wiki/jobs?status=dead` | 200，含插入的 `job-smoke-dead-1` + `lastError=WIKI_LLM_API_KEY 未配置` |
| `POST /api/wiki/jobs/:id/retry` | 200，status 离开 dead → **`running`**（worker 立即 claim，与 impl 偏离说明一致） |
| wiki/pages · memory · settings/status · issues · runs | 皆 **200** |
| `classifyWikiIngestFailure('WIKI_LLM_API_KEY 未配置')` | **`key_missing`** |
| generic（`timeout from llm`） | **`generic`** |

3. **UI**：本会话 **未** 起完整 `pnpm dev` 做浏览器手点；以代码路径 + API 复核为准（impl 原 handoff 亦注明未浏览器全路径）。

## Spec / 票抽查

| 点 | 结论 |
|---|---|
| Wiki dead jobs + retry | 通过（代码 + API） |
| 无 key：横幅/分类 → Settings | 通过（代码 + classify） |
| Memory 失败/不可用可行动；空匹配不混淆 | 通过（代码） |
| QC 预填 `quickPrompt` | 通过（代码） |
| 无新表/密钥写入/Graphiti | 范围正确 |
| 票 01–03 Status | `resolved`；Acceptance 已勾 `[x]` |

## 偏离

与 spec 无未解释功能偏离（与 impl-1「无」一致）。retry 后可能 `pending` 或 `running` 属正常竞态。

## 债 / 风险（不挡下一刀）

1. **UI 浏览器手验** — 本 intake 未重做；人评可侧栏进 `/wiki` dead 表、`/memory` 横幅、`/runs`「去快速派活」预填各点一次。  
2. **CONTEXT 方位过期** — `origin/main` 的 `CONTEXT.md` 仍写「本刀进行中 wiki-memory-ops」；合码后未把方位改成「上一刀已合、下一刀待点名」。下一刀短对齐后应刷新。  
3. **本地 feat 分支领先 main 的 docs commit** — slice-owner 全局 skill 说明（`77c0da0..35c28b8`）未随 PR #18 进 main；若需进仓可另开 docs 合，或依赖用户级 `~/.zcode/skills`（非本刀功能债）。  
4. **运行产物** — 本地 `wiki/`、`app/packages/server/wiki/` untracked；继续勿 commit。  
5. **无 key 时 retry 仍可能再 dead** — 预期；产品路径靠横幅/Settings 引导。  
6. **jobs 服务端排序** — 仍客户端新→旧（spec 允许）。

## 给下一 Owner

- 上一刀 **已在 main（PR #18）**，不要再走 `feat/wiki-memory-ops` 合码流程。  
- 下一主题：人未点名 → **提 2 个候选等人拍板**（产品日常价值；非答辩清单）。  
- 短对齐后更新 `CONTEXT.md` 方位（prev intake = 本文件；本刀/下一刀字段）。  
