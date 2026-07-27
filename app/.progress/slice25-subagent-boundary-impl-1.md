# Slice 25 · 委派边界 hardening · closeout

> 2026-07-27 · 计划 R3 · H4 / BE-08

## 交付

| 路径 | 内容 |
|---|---|
| `subagent-dispatch.ts` | depth 闸 K=2；无 issue readiness；拒绝写父 system 消息 |
| `prompt.ts` | parentRunId → skipMemory |
| `run-worker.ts` | 子 run 跳过 syncRunCompleted |
| `subagent-tree.ts` | summary cap 2000 |
| `subagent-dispatch.test.ts` | 10 tests |
| `subagenttree.test.ts` | 扩展 |

## Must

1. ✅ depth≥K 拒绝  
2. ✅ 子 skipMemory + 不 sync  
3. ✅ summary cap  
4. ✅ 无 issue 走 readiness  
5. ✅ 单测 19 passed  
6. ✅ 无树 UI 重做  

## 证据

```text
vitest subagent-dispatch + subagenttree → 19 passed
pnpm typecheck → Done
```

## 下一刀

Slice 26 WS 轻量订阅 + 重连按页刷新
