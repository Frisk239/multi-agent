# Spec: Wiki / Memory 产品化（失败可操作）

**Status:** ready-for-agent  
**Feature slug:** `wiki-memory-ops`  
**Branch:** `feat/wiki-memory-ops`  
**Role:** Slice Owner（短对齐已收口；默认不满血 grill）

**Product north star:** [AGENTS.md](../../AGENTS.md) · [CONTEXT.md](../../CONTEXT.md) · [design/roadmap.md](../../design/roadmap.md) Phase 5+  
**来源：** phase4b 能力包 **J**（Wiki/Memory 打磨）产品演进版；**不是**补6。

**上一刀 intake：** `app/.progress/run-observability-intake.md`（有条件通过）  
**范围收口：** 人选定 **候选 A + D1**（主刀 Wiki/Memory ops；顺手清 run-obs 轻债）。

---

## Problem Statement

Issue → done 会 enqueue Wiki ingest，无 `WIKI_LLM_API_KEY`（或 LLM 失败）时 job 经重试进入 **`dead`**。后端自 S08 已有：

- `GET /api/wiki/jobs?status=`
- `POST /api/wiki/jobs/:id/retry`（仅 dead）
- Settings 上 Wiki LLM / memory 就绪检查

但 **Web 没有 jobs/DLQ 面**，操作者只看到空 Wiki 列表或 Settings 红点，**不能**从产品路径「看见 dead → 读错误 → 去配置 / 重试」。

Memory 页：空列表与 provider 不可用/加载失败文案易混；失败时缺少 Settings 深链。

## Solution

一刀厚垂直切片：**失败可操作**。

1. `/wiki` 展示 ingest jobs（默认可聚焦 `dead`），`lastError` + **重试** + 键缺失引导 → Settings。  
2. Wiki 页在 LLM 未配置或存在 dead job 时有可行动横幅。  
3. Memory 区分「无匹配」vs「不可用/加载失败」，失败可点 Settings。  
4. **D1 轻债：** run-observability 票 Acceptance 勾选回写；`/runs` QC「去快速派活」可预填 `quickPrompt`。

## User Stories

1. As an operator, I want to see dead wiki ingest jobs in the Wiki page, so that failures are not invisible.  
2. As an operator, I want `lastError` and a human hint (esp. missing API key), so that I know what to fix.  
3. As an operator, I want to retry a dead job after fixing env, so that I need not re-done the Issue.  
4. As an operator, I want a link to Settings when Wiki LLM is missing, so that diagnosis is one click.  
5. As an operator, I want Memory empty vs error vs unavailable to read differently, so that I do not confuse “no rows” with “broken provider”.  
6. As an operator, I want failed QC runs on `/runs` to reopen quick-dispatch with the old prompt when present.  
7. As a developer agent, I want typecheck and API smoke green for wiki/memory/settings/jobs.

## Implementation Decisions

### Seams

| Seam | 角色 |
|---|---|
| **S1** Web client for jobs | `useWikiJobs` / `useRetryWikiJob` → 现有 API |
| **S2** Wiki ops UI | `/wiki` 上 jobs 表 + 横幅（Settings + dead 计数） |
| **S3** Failure classify | 纯函数：`lastError` / settings → `{ code, title, hint, settingsHref? }`（key_missing / generic） |
| **S4** Memory UX | 空态 / `!available` / load error + Settings 链 |
| **S5** D1 轻债 | 票勾选；QC 预填 prompt |

### Backend

- **默认不新造表/路由**；复用 S08 jobs API。  
- 可选小改：列表排序新→旧（若改须 CLI 仍可用）；非必须，UI 可本地 sort。  
- **不做** 密钥写入 DB、不改 auto failCount 策略。

### UI

- **Wiki：** `WikiJobsPanel`（或等价）嵌在 `WikiPage`；筛 status（默认 dead 或「问题优先」）；dead 行「重试」；issue 链到 `/issues/:id`。  
- **横幅：** `useSettingsStatus().secrets.wikiLlmConfigured === false` 或 dead count > 0。  
- **Memory：** provider 不可用横幅；error 行保留并链 Settings；空匹配文案保持「没有匹配的记忆」。  
- **QC 预填：** `QuickDispatchPanel` 支持 `initialPrompt`；`/runs` 链 `/?quickPrompt=`；Sidebar 打开面板并填入后清 query（避免死循环）。

### Shared

- `classifyWikiIngestFailure(error)`（或同等命名）在 `@ma/shared`，与 `classifyRunFailure` 同风格。

## Testing Decisions

- `pnpm -r typecheck`  
- API smoke：`/api/wiki/jobs`、retry dead→pending、memory、settings/status、wiki/pages、issues  
- 手验清单：无 key 时 dead 可见；Retry 后 status 变化；Memory 不可用文案；QC 预填  

## Out of Scope

- Graphiti / 新 Memory backend  
- Wiki 编辑器大改、query/lint 新能力  
- Usage 大盘、Issue labels  
- 系统 auto-retry 策略重写  
- 开「补6」编号  

## Acceptance 画像

1. typecheck 绿  
2. Wiki 页可见 dead jobs + retry  
3. 无 key：横幅/分类指向 Settings  
4. Memory 失败/不可用可行动  
5. QC 预填（有 `quickPrompt` 时）  
6. 回归：issues / settings / wiki pages / memory 200  

## Comments

- 短对齐：候选 A + **D1**（2026-07-17 Owner 会话）。  
- 后端 DLQ 已存在；本刀产品化 UI + 引导 + 轻债。
