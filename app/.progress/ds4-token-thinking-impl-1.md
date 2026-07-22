# Closeout: DS4 Token 尽力 + Thinking Level

Date: 2026-07-22  
Slug: `ds4-token-thinking`  
Commit: `370eacc` on `main`（已 `push origin main`）

## 交付

| 层 | 内容 |
|---|---|
| migrate | `0029_ds4_tokens_thinking.sql`：`agent_run.tokens_*` + `agent.thinking_level` |
| runtime | `usage-parse.ts`；claude/cursor result 行解析 usage → `LineContext` → `ExecutionResult` |
| runtime | thinking → claude/grok `--effort`；cursor/opencode `--variant` |
| worker | 传 `thinkingLevel`；终态落 token 列（有则写） |
| API | roster create/patch thinking；`/api/usage` 与 issue run-usage SUM 非空 token |
| UI | Usage KPI 有数显示 / 无数诚实空；Agent 详情 Thinking select+手填 |

## 证据

- `pnpm typecheck` PASS  
- `pnpm exec tsx scripts/test-ds4-tokens-thinking.mts` ALL PASS  
  - parse claude / modelUsage / camel  
  - thinking_level CRUD  
  - usage 聚合 150/50  
  - clear thinking  

## 偏离

- 未跑真 CLI 产出 token（依赖本机 CLI 输出）；以 fixture 解析 + DB 聚合验收  
- opencode/grok token 仍多为空（无 stream usage）— 不谎报  
- costUsd 仍恒 null（阶段 Out）

## 债

- CLI 不支持 effort/variant 时 run 可能失败 → 用户清空 thinking  
- 全 provider 完美 thinking 枚举 / Codex catalog  
- 历史 run 无 backfill  

## 调研

- `ds4-token-thinking-research.md`

## 给下一 Owner

- 队列：**DS1 session resume**（先调研+ADR；claude MVP）  
- 再 **DS3 Wiki per-project**（必 ADR）  
