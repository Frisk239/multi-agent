# G22 residual honesty — impl-1 closeout

Date: 2026-07-22  
Status: **closed** (binding/discovery 已有；本刀只补诚实与 UI 对称)

## 交付

1. **`agent_run` 快照** — migration `0031_run_model_thinking`：`model` / `thinking_level`（null = 未指定 / CLI 默认）
2. **reshape + shared `AgentRun`** — `model` / `thinkingLevel` optional nullable
3. **run-worker** — 解析 agent 后落库快照；execute 前 log `[model]` / `[thinking]`
4. **grok print path** — `buildGrokAgentArgs`：`tryPrintMode` 与 fallback 同传 `--effort`
5. **Agents create** — freeform model + catalog error/installed + thinking；payload 含 `thinkingLevel`
6. **Agents 列表** — 模型列
7. **RunDetail** — `run-model-line` 展示快照；空 → 「CLI 默认」
8. **Smoke** — `app/packages/server/scripts/test-g22-model-path.mts`

## 验证

```
cd app && pnpm typecheck
cd app/packages/server && pnpm exec tsx scripts/test-g22-model-path.mts
```

## Out / residual

- opencode models 缓存
- pi runtime
- DS4 thinking 枚举重做 / Multica 全量对齐
- 未 claim 的历史 run 无快照（null 诚实显示 CLI 默认）
