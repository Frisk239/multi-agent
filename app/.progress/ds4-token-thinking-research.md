# DS4.0 探针摘要 — Token + Thinking

Date: 2026-07-22

## 结论

| Runtime | Token 解析 | Thinking 旗标 | MVP |
|---|---|---|---|
| claude-code | **高**（result.usage / modelUsage） | `--effort` | 做 |
| cursor | **高**（result usage 多形状） | `--variant` best-effort | 做 |
| opencode | 低（纯文本无 JSON 流） | `--variant` best-effort | 旗标可传；token 暂空 |
| grok | 低 | `--effort` best-effort | 旗标可传；token 暂空 |

## 本仓缺口（探针时）

- `agent_run` 无 token 列；API/UI 硬 null + 「本地不可用」
- `ExecutionResult` 无 usage；claude/cursor 丢弃 result.usage
- agent 无 `thinking_level`；`ExecutionInput` 无 thinking

## 拍板（实现）

1. 迁移 `tokens_*` + `thinking_level`
2. 解析 claude/cursor result 行 → worker 落库
3. Usage / Issue run-usage SUM 非空；全空仍诚实 null；costUsd 恒 null
4. Agent UI select + freeform；worker 传入 backend

## Multica 出处（仅路径）

- claude usage / effort：`pkg/agent/claude.go`
- thinking 列：`migrations/095_agent_thinking_level.up.sql` · `pkg/agent/thinking.go`
