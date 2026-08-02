# G3-4b 执行层注入 —— closeout（2026-08-02 第四波 M1）

**刀名：** G3-4b Agent 环境变量/自定义参数 → run 子进程真实生效
**Goal：** G3（前端体验）/ 目标 M1 半截补全（最优先——消除「已存未用」）

## 背景与勘察结论

- G3-4（编辑 UI）第三波已关：schema `env_vars`/`custom_args` 列 + roster 路由 JSON 序列化 + AgentDetail UI 均就绪。
- 勘察确认半截：`spawn-line.ts` 硬编码 `env: process.env`，五 backend 均未合并 agent envVars；customArgs 无处消费。
- 迁移/列就绪（schema.ts:56-57），本次纯执行层接线，无 DB 变更。

## 改动清单

| 文件 | 改动 |
|---|---|
| `runtime/types.ts` | ExecutionInput + `envVars?: Record<string,string>\|null` / `customArgs?: string[]\|null` |
| `runtime/spawn-line.ts` | spawn env → `{...process.env, ...(opts.env ?? {})}`（显式覆盖）；opts 增 `env` |
| `runtime/agent-inject.ts`（新） | `parseAgentEnvVars` / `parseAgentCustomArgs`：DB JSON → 注入对象；坏数据诚实降级 null（不砸 run） |
| `orchestration/run-worker.ts` | 装配点解析 envVars/customArgs → ExecutionInput；`[env] N 个环境变量注入` / `[args] …` 诚实 log |
| `runtime/claude-code.ts` | customArgs 追加 argv 尾（全 flag 形态）+ opts.env |
| `runtime/cursor.ts` | `buildCursorArgs` 追加尾部 + opts.env |
| `runtime/opencode.ts` | `buildOpencodeArgs` **插入 prompt 之前**（prompt 是末尾位置参数，追加会被当额外消息）+ opts.env |
| `runtime/grok.ts` | `buildGrokAgentArgs` 追加尾部 + tryPrintMode/fallback 两处 opts.env + fallback slim 也注 customArgs |
| `runtime/pi.ts` | spawnRpc 直接 spawn：env 合并 + customArgs 追加尾部 |

## 各 backend argv 形态核对结论（customArgs 注入位置依据）

| backend | argv 形态 | 注入位置 | 理由 |
|---|---|---|---|
| claude-code | `-p --output-format stream-json --verbose [flags]`（prompt 走 stdin） | 尾部 | 全 flag，追加安全 |
| cursor | `-p <prompt> --output-format … [flags]` | 尾部 | flag 可后置（自身即此形态） |
| opencode | `run --format json [flags] <prompt>`（prompt 为末尾位置参数） | **prompt 前** | 追加尾部会被当成额外消息/报错 |
| grok | `--no-auto-update [-p <prompt>] [flags]` | 尾部 | flag 可后置（自身即此形态） |
| pi | `--mode rpc [--session-id] [flags]` | 尾部 | 全 flag，追加安全 |

## 测试与实证

- 新增 `runtime/agent-inject.test.ts`（7 用例）：解析容错 + **真子进程 env 覆盖实证**（node -e 读 process.env，断言 injected 覆盖 base、未覆盖键继承、新增键可见）。
- `cliequalization.test.ts` 扩展 3 用例：三 builder 的 customArgs 注入位置断言。
- **全量门禁（每刀必报）**：`pnpm typecheck` 全绿（shared/web/server）；`pnpm test` = **shared 6 文件 / 121 用例 · server 94 文件 / 820 用例 · web 61 文件 / 438 用例 = 1379 用例全绿**（注：Windows 并行 fork 偶发 `Worker forks emitted error`/`spawn UNKNOWN` 环境 flake——受影响文件单独重跑全绿，与本次改动无关）。
- **printenv 工具任务实证（验收标准）**：本机 claude 无额度，改 grok backend 实证——
  1. 建 agent `g34b-demo`（runtime=grok，envVars=`[{key:'MA_DEMO_ENV', value:'g34b-demo-123'}]`）
  2. issue「printenv MA_DEMO_ENV 报告值」→ run `7e618c82-e821-48ac-996f-791db501faa3` **completed**
  3. run messages（seq 1-2）：「**MA_DEMO_ENV 的确切值为：g34b-demo-123**」「已通过 `printenv MA_DEMO_ENV` 和 `printenv \| grep -i demo` 确认」
  4. 结论：env_vars 落库 → spawn env 合并 → CLI 子进程内（及其 bash 工具子进程）真实可见；与配置值一致。
- 测试数据已清理（agent hard-delete + issue delete，均 404 确认）。

## 决策记录

- env 合并语义：**显式覆盖 process.env**（agent 值优先于进程环境，目标陈述原文）。
- customArgs 注入统一在 builder/execute 显式做（一 backend 一处），不做 spawn-line 中央追加——因为 opencode 位置参数形态特殊，中央追加无法表达「prompt 前插入」。
- 解析容错：坏 JSON/空数组一律 null（不因单条脏数据砸 run），与 mcpServers 既有降级哲学一致。

## 下一刀建议

M2 G5-5 系统/桌面通知（run 终态 + inbox 新项 → node-notifier 或零依赖；Settings 开关；默认关）→ 完成后 G5-6 运营统计。
