# Slice 26 · WS 轻量订阅 + 重连按页刷新 · closeout

> 2026-07-27 · 计划 U1 · B-02 / F-10

## 交付

| 路径 | 内容 |
|---|---|
| `shared` `WsClientMessage` | subscribe + topics |
| `ws-broadcaster.ts` + test | 连接 topics；L/S 匹配；null=全量 |
| `routes/ws.ts` | message → setTopics |
| `web/lib/ws.ts` + test | topicsForPath / invalidateForPath / 路由重订 |
| `scripts/e2e-slice26-ws-subscribe.js` | 骨架 14 pass（live 可选） |

## Must

1. ✅ 可选 topic；legacy 全量  
2. ✅ L/S：stream 仅 run: / run:id  
3. ✅ 前端 pathname subscribe  
4. ✅ 重连按页 invalidate  
5. ✅ 无 Redis  
6. ✅ unit 28 pass + typecheck  

## 证据

```text
ws-broadcaster.test 10 passed
ws.test 18 passed
e2e skeleton 14 passed
typecheck Done
```

## 债

- 未起全栈 Playwright 连断列表；脚本 live 段 skip

## 下一刀

Slice 27 交互手感包
