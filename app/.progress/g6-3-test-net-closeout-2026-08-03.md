# G6-3 核心模块测试补网 —— closeout（2026-08-03）

**刀名：** G6-3 核心模块测试补网（claude-code args / run-service 熔断边界 / wiki-llm 降级分支）
**Goal：** G6（后端执行与运营精细度）/ 第八波第三刀（§4 第 17 行既定顺序收官刀）

## 现状基线（开工前核对）

- `runtime/claude-code.ts`（194 行）execute 内联 args 构造（:133-142）零直测。
- `run-service.ts` checkAndEnqueue 熔断（MAX_RUNS_PER_ISSUE=15，:315）零测试；per-(issue,agent) 去重无独立断言。
- `wiki/llm.ts`（70 行）createLlm / buildIngestPrompt / generateWikiPage 零直测（降级分支此前仅经 ingest-queue 间接覆盖）。

## 落地改动

1. **claude-code args 抽纯函数**：`runtime/claude-code.ts` 新增 `export function buildClaudeArgv(opts)`（base `-p --output-format stream-json --verbose` + model/effort/resume/customArgs 条件追加，trim 空则省略）；execute 内联块替换为调用。无行为变化（原逻辑 1:1 迁移）。
2. **测试**（+21 用例）：
   - `runtime/claude-code.test.ts`（新，6 用例）：base 恒定 / model 空省略 / effort / resume / customArgs 追加 / 全组合顺序钉死。
   - `wiki/llm.test.ts`（新，11 用例）：createLlm 无 key 诚实 throw / 默认 openai+gpt-4o / model 覆盖 / anthropic 分支（constructor 断言）/ baseURL 传递 / 未知 provider 回退；buildIngestPrompt 非增量/增量（知识冲突 Warning）模板；generateWikiPage string 直返 / 复杂块 JSON.stringify / invoke 抛错原样上抛。
   - `orchestration/run-service.enqueue.test.ts`（新，4 用例，真实迁移 DB + readiness mock）：熔断边界 14 可派 / 15 拒绝（skipped('run_limit') + system comment 落库 + inbox 通知 + 不发 wake）/ quick_create 不计数（14 issue + 2 QC = 16 行仍可派）/ per-(issue,agent) 去重（active 挡、另一 agent 不受影响）。

## 测试与实证

- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 930 + web 465 = 1516 全绿**（1495 + 21 新用例）。
- 稳定性加固：run-worker G6-1 两用例 waitFor 超时 1000ms → 5000ms（全量首跑模块转译慢可致偶发超时；超时后重跑全量 ×2 均绿）。
- livebind 基建评估：本刀三块均为纯函数/真实 DB 直测，livebind（ESM live binding 演示）不适用，未强用（roadmap 措辞为「复用基建」，按需取用）。

## 决策记录

1. **纯函数抽取而非测试内重复构造**：buildClaudeArgv 是 execute 的唯一 argv 真源，测试即钉死契约；行为 1:1 迁移零回归风险。
2. **熔断边界测试用字面量 15 而非导出常量**：避免为测试改生产导出面；注释钉住与 run-service.ts:19 的一致性。
3. **wiki-llm 直测在真实类上做（不 mock LangChain）**：ChatOpenAI/ChatAnthropic 实例化无网络副作用；分支判定用 constructor.name 而非私有字段（防字段名漂移）。

## 下一刀建议

§4 第 17 行既定三刀收官。按 §3 价值取用：**G6-4 sweeper 收尸路径原子化 + 假批量注释修正**（无内存依赖路径改单条条件 UPDATE，学 multica `agent.sql:569`；deferred 查重去 N+1；修「批量更新」注释诚实性污点）或 **G6-6 pi extension_ui_request 诚实提示**（CLI 等确认时 run:progress 告知，不再静默卡 30 分钟）。
