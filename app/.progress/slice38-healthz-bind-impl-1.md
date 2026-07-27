# Slice 38 · 本地安全默认 + 进程健康面 · closeout

> 2026-07-27 · 计划 [slice-plan-2026-07-27-phase-b.md](./slice-plan-2026-07-27-phase-b.md) R5

## 交付

| 路径 | 内容 |
|---|---|
| `packages/server/src/bind.ts` | `resolveListenHost`：默认 `127.0.0.1`；`MA_BIND` > `HOST` |
| `packages/server/src/cors-origin.ts` | 默认 web origin；`MA_CORS_ORIGIN` 可扩 / `*` |
| `packages/server/src/process-health.ts` | worker lastTick + overall ok/degraded + 可选 DB ping |
| `packages/server/src/routes/healthz.ts` | `GET /healthz` |
| `index.ts` / `app.ts` | listen host + 收紧 CORS + 注册 healthz |
| workers | run / automation / wiki-ingest / stale-sweeper 记 tick |
| Settings diagnostics | server 行展示 bind + 局域网暴露一行提示 |
| README + `.env.example` | `MA_BIND` / `HOST` / `MA_CORS_ORIGIN` / healthz |
| 单测 | `bind` · `cors-origin` · `process-health` · `healthz` 路由 |

## Must 对照

1. ✅ 默认 listen `127.0.0.1`；`MA_BIND` / `HOST` 可放开 `0.0.0.0`
2. ✅ CORS 默认 `localhost:3000` + `127.0.0.1:3000`；`MA_CORS_ORIGIN` 可配
3. ✅ `/healthz` → ok/degraded + 各 worker `lastTickAt`/`ageMs`/`running` + DB ping
4. ✅ Settings diagnostics + README/`.env.example` 一行局域网说明
5. ✅ 密钥仍不落库（无 token 入库）
6. ✅ 单测 15 passed；server typecheck 0 error

## 默认 bind / env

- **默认 host：** `127.0.0.1`
- **env：** `MA_BIND`（优先）· `HOST`（次）· `PORT`（默认 3001）· `MA_CORS_ORIGIN`

## healthz JSON 形状

```json
{
  "status": "ok" | "degraded",
  "ts": 0,
  "uptimeMs": 0,
  "db": { "ok": true, "latencyMs": 0 },
  "workers": {
    "runWorker": { "lastTickAt": 0, "ageMs": 0, "running": true },
    "automationWorker": { "...": "..." },
    "wikiIngestWorker": { "...": "..." },
    "staleRunSweeper": { "...": "..." }
  }
}
```

未启动 worker 或 tick 过旧、或 DB 失败 → `degraded`。

## 证据

```text
vitest bind + cors-origin + process-health + healthz → 4 files, 15 tests passed
pnpm typecheck (@ma/server) → 0 error
```

## Out / 债

- 完整 OAuth / 本地 token 鉴权未做（计划 Out）
- Prometheus 未做
- Web 前端仍硬编码 `localhost:3001`；LAN 场景需另改前端 API base（本刀 Out）

## 下一刀

**Slice 39** Run 状态转移统一 + Wiki 退避（R6）
