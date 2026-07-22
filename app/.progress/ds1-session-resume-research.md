# DS1.0 Research: CLI 真 Session Resume

Date: 2026-07-22  
Owner: Slice Owner  
Sources: 本仓 explore 子代理 · Multica explore 子代理 · `claude.go` file:line 抽检

## 结论

1. 本仓 **无** provider session 落库 / 解析 / `--resume`；chat 靠 **塞历史进 prompt**（假 resume）；D2 只复用 **workdir**。
2. Multica：`PriorSessionID` + poison 黑名单 + workdir 解耦；claude 用 `--resume <id>`，stream-json 带 `session_id`。
3. **MVP 拍板：** 仅 **claude-code** 真 resume；poison → **fresh**；其它 runtime 诚实「不支持」；与 workdir 复用分列展示。

## 本仓现状

| 项 | 状态 | 证据 |
|---|---|---|
| `agent_run` session 列 | **无** | `schema.ts` agent_run：tokens/cwd/rerun_of，无 provider_session |
| Backend 解析 session_id | **无** | `claude-code.ts` 只解析 system/assistant/user/result+usage |
| `--resume` | **无** | claude args：`-p --output-format stream-json --verbose` [+model/effort/mcp] |
| Chat 多轮 | 假 resume | `prompt.ts:135-149` 注释钉「无 Multica session 复用」 |
| Issue 再执行 | 新 run + `rerunOfRunId` | `run-service.ts` rerunIssue；**不**读 session |
| Workdir | 同 issue/thread 稳定路径 | `resolve-run-cwd.ts`；D2 Out 含真 resume |

## Multica（仅语义 + 出处）

| 概念 | 一行语义 | 出处 |
|---|---|---|
| PriorSessionID | claim 回填可续 CLI session；**同 runtime** | `handler/daemon.go:1999` 一带 |
| PriorWorkDir | 可跨 runtime best-effort 复用目录 | `daemon.go:1990-1995` |
| poison / resume-unsafe | 会话历史坏了，续跑会重放失败；**≠** 毁 workdir | `daemon/poisoned.go:10-27` |
| Rerun prior | **精确源任务** session（未毒且同 runtime） | `daemon.go:1971-2001` |
| Follow-up prior | `GetLastTaskSession` 排除毒会话 | `agent.sql:625-678` |
| claude resume | `args += --resume ResumeSessionID` | `pkg/agent/claude.go:642-643` |
| session_id 字段 | stream-json `session_id` | `claude.go:470`；result/init 行 |
| 失败 resume 报告 | requested≠emitted 且 failed → 报告 `""` | `claude.go:681+ resolveSessionID` |
| deep 覆盖 | 仅告诫别抄全套 force_fresh 双语义 | `references/deep/multica.md:290` |

## 与本仓差异 → 应对

| Multica | 本仓 MVP |
|---|---|
| daemon claim Prior* | worker execute **前** 解析 prior |
| 多 runtime + 全套 failure_reason | **仅 claude-code**；毒因 3～5 条字面匹配 |
| force_fresh 双语义 | **单义**：毒 / 无 session / 非 claude → fresh |
| workdir 与 session 解耦 | 保留；毒只丢 session |

## 选项与推荐

| # | 选项 | 决 |
|---|---|---|
| A | 全 runtime 统一 resume | ❌ 能力不齐易撒谎 |
| B | **claude-only：落库 + 解析 + --resume + 最小 poison** | ✅ **本刀** |
| C | 先做 poison 全集 | ❌ 过厚 |
| D | 仅 workdir 文案加强 | ❌ 非 DS1 目标 |

## 风险

- Chat 历史 + 真 resume **双倍上下文** → resume 时跳过 history 块  
- cwdMode/model 变更后盲 resume → MVP：同 runtime + 未毒即可；换 model 不强制清（可后续）  
- `memory.sessionId` 是 issue 语义，勿混  
- 真 CLI 依赖本机 session 文件；fixture 测解析与决策即可  

## 下一文件

- ADR：`docs/adr/0004-cli-session-resume.md`  
- 实现：migration 0030 + worker/claude + UI 诚实展示  
