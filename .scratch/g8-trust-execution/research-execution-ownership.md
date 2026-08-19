# G8-2 调研：崩溃后 CLI execution ownership

> 范围：只读核对 Multica、Pi 与本仓运行链；本报告不改 `app/`。日期：2026-08-17。

## 结论先行

1. 当前实现只能**收尸数据库状态**，不能安全地收尸崩溃前仍存活的 CLI：启动即把无内存 `AbortController` 的 `running` 行标为 `failed/stale_heartbeat`，但没有持久 PID 或启动身份；随后新 run 可能与幽灵 CLI 同时写同一目录。证据：`app/packages/server/src/orchestration/run-control.ts:1-13`、`app/packages/server/src/orchestration/stale-runs.ts:257-290`、`app/packages/server/src/db/schema.ts:260-352`。
2. **PID 存活不等于本产品拥有该进程。** 现有 `process-tree` 仅持久于内存的 `pid -> registeredAt`，并按裸 PID 调 `taskkill /T /F` 或 `kill(-pid)`；该接口只适合当前进程生命周期，不能直接用于重启后的 PID。证据：`app/packages/server/src/runtime/process-tree.ts:13-18,38-108`；Pi 同样仅以裸 PID 杀树，未提供重启身份校验：`references/repos/pi/packages/coding-agent/src/utils/shell.ts:176-224`。
3. Multica 的可迁移核心是 **DB 状态 lease + runtime ownership**，不是跨重启的 PID 盲杀：`dispatched` 用 `prepare_lease`，daemon 启动时将其 runtime 的在途任务原子失败，长任务则靠 runtime heartbeat 免于误杀。证据：`references/deep/multica.md:112-120`、`references/repos/multica/server/pkg/db/queries/agent.sql:591-648,895-969`。
4. 推荐 G8-2 采用**独立 SQLite 侧表 + 严格指纹匹配 + fail-closed 可观测**。可验证才杀树并写 `orphan_killed`；缺记录、指纹不符、查询失败或根进程已消失而无法证明整树已消失时，绝不杀，写 `unknown_external_execution`，且不自动重试。推论基础：现有运行身份只在内存、Pi 的裸 PID kill 也没有 restart verification，而 Multica 把 OS 树清理限制在已知当前生命周期的独立 process group。`app/packages/server/src/runtime/process-tree.ts:13-108`、`references/repos/pi/packages/coding-agent/src/utils/shell.ts:176-224`、`references/repos/multica/server/pkg/agent/proc_other.go:16-58`。

## 上游做法与本仓差异

| 主题 | 上游实做 | 本仓现状/差异 | 对 G8-2 的含义 |
|---|---|---|---|
| claim/prepare 恢复 | Multica 先 `dispatched + prepare_lease`，过期且未 `StartTask` 才原子重投递；进入 `running` 后清 lease。`references/repos/multica/server/pkg/db/queries/agent.sql:591-663` | 本仓以 `running + prepareLeaseExpiresAt` 表示半 claim，并在 `registerRunAbort` 后清 lease。`app/packages/server/src/orchestration/run-worker.ts:199-233,411-446` | 现有 prepare lease 可保留；ownership 只覆盖已经真实 spawn 的稳定执行期。 |
| restart reconciliation | Multica 以 `runtime_id` 为逻辑边界，将上一 daemon 所有 dispatched/running/waiting 行原子置 `runtime_recovery`；没有把旧 PID 重新接管。`references/repos/multica/server/pkg/db/queries/agent.sql:895-910` | 本仓启动调用 `recoverStuckRuns()`，其中无 abort 的 running 一律 `stale_heartbeat`。`app/packages/server/src/index.ts:78-83`、`app/packages/server/src/orchestration/stale-runs.ts:264-290` | 继续先做 DB reconcile，但在 terminal write 前增加「可否确认 OS execution」判定。 |
| 长任务活性 | Multica running 的墙钟 backstop 排除仍 online 且 `last_seen_at` 新鲜的 runtime，避免杀多小时正常任务。`references/repos/multica/server/pkg/db/queries/agent.sql:912-969` | 本仓有 heartbeat/idle/tool watchdog 与 sweeper，且 prepare lease 会先于 orphan 处理。`app/packages/server/src/orchestration/stale-runs.ts:38-109,468-525` | 不将 ownership 指纹当 heartbeat；它只解决 crash 后 OS 实体确认。 |
| 当前生命周期树清理 | Multica POSIX 将 child 设为独立 PGID，才安全按 `-pid` 杀整树；Windows 常规 backend 没有 PGID，自己也承认不能确认 descendants。`references/repos/multica/server/pkg/agent/proc_other.go:16-58`、`references/repos/multica/server/pkg/agent/proc_windows.go:36-56` | 本仓 spawn 后只在内存登记 PID；Windows `.cmd` shim 已注释可能令真实 CLI 成孤儿。`app/packages/server/src/runtime/spawn-line.ts:45-55,94-121` | G8-2 要把「启动时可建立的组/Job」与「重启后可验证的根身份」分开设计。 |
| Pi 可借鉴与边界 | Pi POSIX shell 以 `detached: true` 建组，退出/信号时扫内存 PID 集；orchestrator restart 只把逻辑 instance 标 `stopped`，不持久 PID。`references/repos/pi/packages/coding-agent/src/core/tools/bash.ts:96-145`、`references/repos/pi/packages/orchestrator/src/supervisor.ts:244-255` | 本仓 `trackChildPid` 也同样纯内存。`app/packages/server/src/runtime/process-tree.ts:13-36` | 可借 `detached`/当前生命周期 kill；不能照搬 Pi 的裸 `taskkill` 到 crash reconcile。 |

## 实现选项

| 选项 | 做法 | 优点 | 风险/结论 |
|---|---|---|---|
| A. 给 `agent_run` 加 nullable ownership 列 | `pid`、`boot_id`、`started_fingerprint`、`exe_hash`、`cwd_hash`、`registered_at` 直接随 run 写/清 | 改动面小，读取少一次 join | 正常结束后「清除」会抹掉审计，运行行与 OS-lifecycle 耦合过紧；多种 backend/未来多进程字段会膨胀。可做 MVP，但不是首选。 |
| **B. 独立 `run_execution_owner` 表（推荐）** | 一对一 active owner：`run_id PK/FK`、`pid`、`platform`、`boot_id`、`start_token`、`exe_hash`、`argv_hash?`、`cwd_hash`、`process_group_id?`、`registered_at`、`launch_nonce`；`run_id` 唯一 | 与 `agent_run` 的业务终态分离，易加 reconcile 结果/索引/审计；符合本仓 Drizzle migration 与「DB 行即锁」模式 | 需新 schema、migration、shared reason/UI 映射；这是可控的中等厚度。 |
| C. 常驻 supervisor/Windows Job Object 全托管 | child 放专门 watchdog/Job；父服务重启后向 helper 查询/关闭 | Windows 可由 Job Object 更可靠地带走 descendants（Multica 的 helper 使用 `KILL_ON_JOB_CLOSE` 和 active-count 验证：`references/repos/multica/server/internal/daemon/execenv/isolation_windows.go:32-123`） | 已接近新增 daemon/IPC，超出 G8-2 与本仓约束；作为后续 Windows 强化，不在本刀实现。 |

## 推荐方案：B 的最小安全闭环

1. **登记。** `spawn` 成功拿到 child PID 后，立刻取平台指纹并在同一 run 的 `status='running'` 条件下插入 owner；取不到完整必需指纹则不写「可杀」记录，而写一条 `verification_state='unverified'`。`spawnLineProcess` 和 ACP transport 都是登记切点：`app/packages/server/src/runtime/spawn-line.ts:49-55`、`app/packages/server/src/runtime/acp-transport.ts:500-533`。
2. **正常清理。** child `close/exit` 后删除 active owner（或设 `released_at`），再走既有 run 终态；关停中的内存 kill 仍可复用当前 `killProcessTree`。证据：`app/packages/server/src/runtime/spawn-line.ts:76-91`、`app/packages/server/src/orchestration/graceful-shutdown.ts:127-193`。
3. **启动 reconcile。** 在 `startRunWorker()` 前异步遍历 `running` run + owner：只在 `pid + boot_id + start_token + executable 摘要 + cwd 摘要` 均匹配、且 POSIX 的受控 PGID/Windows 的根进程也可确认时，调用受检的 `killProcessTree`，再条件更新为 `failed / orphan_killed`；其他任何结果都**不调用 kill**，条件更新为 `failed / unknown_external_execution`，清理 active owner，并写 `logger.warn` 与 Run 可见 activity/inbox。启动顺序证据：`app/packages/server/src/index.ts:78-83`。
4. **并发与重试。** reconcile 的终态写继续用 `WHERE status='running'`（现有 `transitionAndScheduleAutoRetry` 路径：`app/packages/server/src/orchestration/stale-runs.ts:271-286`）。`unknown_external_execution` 必须列入 shared enum 与 Web failure map，且不进 auto-retry allowlist；当前 allowlist 明确只允许四个基础设施原因：`app/packages/shared/src/schema.ts:54-75`、`app/packages/shared/src/failure-classify.ts:10-27`、`app/packages/web/lib/failure-action-map.ts:120-155`。这是防止疑似仍在写盘的 run 被自动再开一轮。
5. **诚实边界。** crash 恰发生在 child 成功 spawn 与 owner 落库之间，仍不能反查该 child；此时必须降级为 unknown，而非虚构「已清理」。同理，根进程已不见但无法证明它没有脱离的 descendants，不能据此宣称目录安全。

## Windows / POSIX 安全注意点

| 平台 | 可记录并复核的身份 | kill 前硬条件 | 禁止项 |
|---|---|---|---|
| Linux | `/proc/<pid>/stat` 的 start ticks（正确解析括号包裹 comm）、`/proc/sys/kernel/random/boot_id`、`/proc/<pid>/exe` realpath hash、`cwd` symlink hash、PGID | 所有字段匹配，且启动时明确 `detached:true` 并复核 PGID=`pid` 后才允许 `kill(-pid)` | 仅 `kill(pid, 0)` 或仅 PID 后杀组；PID 重用/PGID 变化都应 unknown。 |
| macOS/其他 POSIX | `ps` 的 PID/PGID/start time/exe（固定 argv、`LC_ALL=C`、严格解析）；无法稳定读取即 unverified | 初版宁可 unknown，不跨重启杀；若后续支持，须同 Linux 一样校验独立 PGID 与 start token | 把 Linux `/proc` 假定为全 POSIX 都有。 |
| Windows | `Win32_Process` 的 `ProcessId`、`CreationDate`、`ExecutablePath`、命令摘要 hash（不落全文）；可额外记录系统启动世代 | PID 与 CreationDate、exe、摘要都匹配后才 `taskkill /T /F`；等待并记录命令结果 | 直接按 owner.pid `taskkill`；把 `cmd.exe` shim 已退出等同于整树已退出。Windows 无 PGID，后续要强保证应采用 Job Object。 |

`argv`/命令行只存 hash，不存原文：CLI 参数可能含 token；Multica 明确让 stdin/file 输入避免 secret 留在 shell history 或 `ps`/`/proc/<pid>/cmdline`，也把可能带 `--api-key` 的 custom args 错误改为 content-free。`references/repos/multica/server/cmd/multica/cmd_agent.go:1122-1141`。

## 可验收测试矩阵

| 场景 | fixture / mock | 期望 |
|---|---|---|
| 已验证 Linux owner | PID、boot、start ticks、exe/cwd hash、PGID 全匹配；mock tree kill | 仅一次 kill；run 条件终态为 `failed/orphan_killed`；owner 清理；活动/WS 可见。 |
| PID 重用 | 同 PID、不同 start token 或 boot id | **零 kill**；`failed/unknown_external_execution`；human CTA，不自动 retry。 |
| 记录不存在 / legacy running | `running` 无 owner | **零 kill**；明确 unknown 文案与用户可见提示；不回退到裸 PID。 |
| 进程探测失败或根已消失 | probe throws / `not_found` / 无法证明 descendants | **零 kill**；unknown 记录含 probe reason；不会宣称已收尸。 |
| 正常 exit 与取消 | spawn→persist→close；AbortSignal 当前生命周期 | active owner 被删除/释放；现有 cancel 和 tree-kill 回归通过。 |
| 竞争 | reconcile 与 cancel/prepare sweeper 同时触发 | 只有一个 `WHERE status='running'` 赢；无重复 kill、无重复 WS/activity、无新 retry child。 |
| Windows shim | `.cmd` / `shell:true` 根先退出的 fixture | 不根据旧 root PID 枚举/杀猜测 descendant；提示未验证；现有 5s abort 兜底不回归。`app/packages/server/src/runtime/spawn-line.ts:105-121`。 |
| API/UX contract | shared Zod + `failure-action-map` + RunDetail | `unknown_external_execution` 被解析为「未验证的外部执行」，CTA 为先确认进程/目录再人工 rerun，而非「重试」。 |

## 建议实现落点

- schema + drizzle migration：`app/packages/server/src/db/schema.ts`；不要把 `failure_reason` 新值只写 DB 而漏掉 `app/packages/shared/src/schema.ts`。
- 平台探测/验证：新建窄模块（例如 `runtime/execution-owner.ts`），把 **probe** 与 **kill** 分离、可依赖注入，令测试无需真杀进程。
- 写入点：`runtime/spawn-line.ts`、`runtime/acp-transport.ts`；读取/reconcile：`orchestration/stale-runs.ts` 与 `index.ts` 启动序列。
- UI 最小可见面：扩展 `web/lib/failure-action-map.ts` + Run Detail 的 failure chip；无需为本刀开新大页。
