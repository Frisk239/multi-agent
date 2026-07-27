# Slice 28 · 模型价表成本纵深 · closeout

> 2026-07-27 · 计划 U2

## 交付

| 路径 | 内容 |
|---|---|
| `runtime/model-rates.ts` | load + estimateCost；无配置 uncosted |
| `model-rates.example.json` | 样例 |
| analytics / usage / issue run-usage | 诚实 cost |
| reshape AgentRun | costUsd 实时 |
| TokenCostDashboard 等 UI | $ 或 uncosted |
| tests + e2e 骨架 | |

## Must

1. ✅ 可配置 rates  
2. ✅ 禁止假 $0  
3. ✅ issue/agent/project 汇总  
4. ✅ chip 可见  
5. ✅ 密钥不落库  

## 证据

```text
model-rates + reshape tests 13 passed
pnpm typecheck Done
```

## 下一刀

Slice 29 看板/列表虚拟滚动
