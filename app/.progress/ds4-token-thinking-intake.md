# Intake: DS4 Token 尽力 + Thinking Level

Date: 2026-07-22  
Owner: Slice Owner (本会话)  
Prior closeout: `app/.progress/ds4-token-thinking-impl-1.md` · commit `370eacc`

## Verdict

**通过** — 可开下一刀 **DS1 CLI session resume**。  
**不要重做 DS2/DS4。**

## 验收对照

| 检查项 | 结果 |
|---|---|
| closeout 与 main 对齐 | ✅ `370eacc` 在 main；`aac0381` docs catch-up 本地 |
| migration `0029_ds4_tokens_thinking.sql` | ✅ `agent_run.tokens_*` + `agent.thinking_level` |
| `usage-parse.ts` | ✅ claude / modelUsage / camel 别名；`extractTokenUsage` + `parseUsageFromResultLine` |
| worker 落库 | ✅ 终态写 `tokensInput/Output/Cache*`（有则写） |
| thinking → spawn | ✅ claude/grok `--effort`；cursor/opencode `--variant` |
| Usage KPI 双模式 | ✅ 有 token 显示 in/out；无数「本地不可用」+「尚无 CLI 上报 token；费用恒不可用」 |
| 脚本回归 | ✅ `pnpm exec tsx scripts/test-ds4-tokens-thinking.mts` → **ALL PASS** |
| 密钥 / 运行产物 | ✅ 无密钥入库；未 commit wiki/db |

## 已知债（不挡 DS1）

- 真 CLI 未实测 token 产出（fixture + 聚合验收）
- opencode/grok 多数仍无 stream usage — 诚实空
- costUsd 恒 null（阶段 Out）
- CLI 不认 effort/variant 时 run 可能失败 → 用户清空 thinking

## 给本会话

- 队列：**DS1**（先调研+ADR；claude MVP）→ 再 DS3
- 区分：P2/D2 **仅 workdir 复用** ≠ 本刀 **真 provider session resume**
