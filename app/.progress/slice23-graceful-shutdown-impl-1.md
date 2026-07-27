# Slice 23 · 进程生命周期硬化 · closeout

> 2026-07-27 · 计划 [slice-plan-2026-07-27-next.md](./slice-plan-2026-07-27-next.md) R1

## 交付

| 路径 | 内容 |
|---|---|
| `packages/server/src/orchestration/graceful-shutdown.ts` | `cancelAllActiveRuns` / `shutdownServer`；可注入 deps |
| `packages/server/src/orchestration/graceful-shutdown.test.ts` | 顺序 + grace timeout |
| `run-worker.ts` | `stopRunWorker` |
| `stale-runs.ts` | `stopStaleRunSweeper` |
| `wiki/ingest-worker.ts` | `stopWikiIngestWorker` |
| `index.ts` | once SIGINT/SIGTERM → shutdown → app.close → exit；hard timer |

## Must 对照

1. ✅ 停 workers → DB ACTIVE → `cancelRunsMany` → residual `abortRun` → 等 empty/grace  
2. ✅ hard exit（`MA_SHUTDOWN_HARD_MS`，默认 12s）  
3. ✅ 复用 cancel/abort/spawn-line，未重写 killTree  
4. ✅ vitest 12 passed（含 4 新测）+ typecheck 0 error  
5. ✅ 无 Redis/多节点；前端无改  

## 证据

```text
vitest graceful-shutdown + run-control + stale-runs → 3 files, 12 tests passed
pnpm typecheck → shared/server/web Done
```

## 偏差 / 债

- wiki/memory 关停仅停 timer，不 drain（计划 Out / best-effort）  
- 未做真 spawn e2e；重启 orphan 仍靠 `recoverStuckRuns`  
- Windows 子进程树仍依赖 spawn-line 5s 兜底  

## 下一刀

**Slice 24** Memory 写可靠 + 断路器（H1/H2）  
