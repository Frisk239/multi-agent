# Closeout · Slice 47 · Wiki running lease（H2）· 2026-07-27

## 交付

| Must | 结果 |
|---|---|
| running 超 lease → 可再 claim | ✅ `requeueStaleRunningJobs` → fail 路径 pending+backoff/dead |
| 与 nextAttemptAt/dead/retry 兼容 | ✅ complete/fail 仅 status=running |
| 启动 recover 不双杀 | ✅ recover 不增 failCount；lease 走 fail |
| env 默认 | ✅ `MA_WIKI_RUNNING_LEASE_MS` 默认 20min；`0` 关 |
| 单测时钟 | ✅ wiki 23 passed（含 lease 6） |
| e2e | ✅ API smoke PASS；live running WARN（unit 覆盖） |
| typecheck | ✅ |

## 下一刀

**Slice 48 · ConfirmDialog 统一 + 指派减噪**

## 裁决

**关刀。**
