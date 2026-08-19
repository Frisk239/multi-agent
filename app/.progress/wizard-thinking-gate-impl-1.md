# Closeout: 新建向导 Thinking 门控

日期：2026-08-19  
Slug：`wizard-thinking-gate`

## 用户路径

新建 Agent → 选 runtime=pi → 无 Thinking 编辑器 → 提交 `thinkingLevel: null`。claude/opencode 仍可设 effort。

## 交付

- `runtimeCapabilityState` 抽到 `lib/runtime-capability.ts`，Detail/向导共用
- 向导 + Detail runtime 列表 = `RuntimeId.options`（含 pi）
- 向导 step 2 按 catalog 门控；不支持则提交清空

## 证据

```
pnpm --filter @ma/web typecheck
vitest AgentBuilderWizard + AgentDetailPage + runtime-capability → 22 passed
```

## 债

模板若自带 thinking、用户先选 claude 再改 pi：切换时已清空。catalog 未加载时 fail-closed 不写入。
