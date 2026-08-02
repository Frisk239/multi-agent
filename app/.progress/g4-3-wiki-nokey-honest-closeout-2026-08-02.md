# G4-3 Wiki ingest 无 key 降级诚实化 closeout（2026-08-02）

> Goal G4 知识/记忆 · roadmap §4 队列第 8 刀（M1 末刀）。状态：**已关 ✅**（与 G1-5 的 Wiki 半边合并验收）

## 目标

无 LLM key 时 Wiki ingest 不反复重试退避（现状退避至 15min 无提示）；UI/Settings 明确「未配 LLM key，Wiki 编译不可用」。query 关键词降级已有（query.ts:69-77），本刀补齐 ingest 侧。

## 勘察结论

- 无 key 现状：enqueue 照常 → worker claim → `createLlm` 抛 `WIKI_LLM_API_KEY 未配置`（llm.ts:12-16）→ fail 路径 **烧 5s/10s/20s 三轮退避后 dead**；人工 retry 未配 key 会再烧一轮。`failWikiIngestJob`（ingest-queue.ts:137-167）无 no-key 识别。
- UI 侧已基本就绪：WikiHealthPanel 横幅 + 语义检查禁用、WikiJobsPanel dead 指引、EnvBanner、Settings `wiki_llm` 健康检查 + 配置引导——本刀验收确认，无需新增文案。

## 改动

| 文件 | 改动 |
|---|---|
| `wiki/ingest-queue.ts` | `failWikiIngestJob` 识别错误含 `WIKI_LLM_API_KEY` → **一次失败即 dead**（跳过退避分支）；非 no-key 错误保持指数退避 |
| `wiki/ingest-queue.test.ts` | 新增 3 用例：no-key 直接 dead（failCount=1 且不落 pending）、no-key 人工 retry 后仍直接 dead、非 no-key 仍退避 |

## 真机验收（dev.db + 本地 server，临时移走 `.env` 模拟无 key + Playwright）

1. `/api/settings/status` → `wiki_llm: error` + hint「在 server 环境配置 WIKI_LLM_API_KEY 后重启；修好后到 Wiki dead 队列重试」✅
2. Wiki 页横幅：**「Wiki LLM 未就绪 — 语义检查 / 自动编译依赖 WIKI_LLM_API_KEY。结构检查仍可离线使用。」** + 环境诊断/dead 任务/记忆链接 ✅
3. Settings：错误行 + 「Wiki LLM 配置引导」区（导出 key → 重启 → dead 队列重试 + 一键重试按钮）✅
4. **端到端不反复重试**：issue → done → wiki job enqueued → worker → no-key → **dead，failCount=1（轨迹 1/3），lastError `Error: WIKI_LLM_API_KEY 未配置`**——不再是 3 轮退避 ✅
5. 证据：`.playwright-cli/m1-g4-3-wiki-nokey-banner.png` / `m1-g4-3-settings-wiki-llm.png` / `m1-g4-3-wiki-dead-jobs.png` + 快照 yml

## 门禁

- server 全量 726 passed（90 文件）；monorepo 全量 1253 passed（shared 103 + server 726 + web 424）；typecheck 全仓绿

## 未做（后续刀）

- G1-5 剩余半边：Memory pgvector 软回退（Wiki 半边已由本刀覆盖）
- query 降级答案末尾无「降级说明」注记（关键词直出即答，可接受；如需可加一行提示）
