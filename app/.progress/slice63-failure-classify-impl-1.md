# Slice 63 · failureReason 扩档 + Classify 规则表 · impl-1

## 改动

### 1. `packages/shared/src/schema.ts`
- `AgentRunFailureReason` 追加 5 档：
  - `auth_required` / `quota_exceeded` / `session_poisoned` / `cancelled` / `user_aborted`
- 现有 8 档保留（共 13）

### 2. `packages/shared/src/failure-classify.ts`（新 · 真源）
- `classifyFailure(error, hints?)` → `AgentRunFailureReason`
- `hints.explicitReason` 优先；否则规则表；默认 `exec_error`
- 匹配序（具体→泛化）：user_aborted → cancelled → auth → quota → session_poisoned → squad_member_escalated → tool_watchdog → idle_timeout / idle_watchdog → waiting_local → stale_heartbeat → timeout → exec_error
- `hints.status === 'cancelled'` 且无串匹配时回落 `cancelled`
- `squad_member_escalated` 先于 idle/timeout（结构化前缀含嵌套 original_reason）

### 3. `packages/shared/src/index.ts`
- re-export `./failure-classify.js`

### 4. `packages/server/src/orchestration/run-worker.ts`
- `inferFailureReason` 薄包装 → `classifyFailure(error)`
- `failRun` 仍：`failureReason ?? inferFailureReason(error)`（显式覆盖优先）

### 5. stale-runs
- **未改**：已知原因路径继续写死 `failureReason`（符合「显式优先」）

### 6. 兼容
- `classifyRunFailure`（UI title/hint）**未动**；64 可挂新 reason map

### 7. 测试
- `failure-classify.test.ts`：新/旧档样例 + 优先级 + explicitReason
- `schema.test.ts`：枚举列表含新值并 `options` 对齐

## 命令证据

### shared typecheck
```text
cd app/packages/shared && pnpm exec tsc --noEmit
```
结果：clean

### shared unit
```text
cd app/packages/shared && pnpm exec vitest run src/schema.test.ts src/failure-classify.test.ts
```
结果：2 files / 65 tests **PASS**

### server typecheck
```text
cd app/packages/server && pnpm exec tsc --noEmit
```
结果：`server_tsc_exit=0`

### server related unit
```text
cd app/packages/server && pnpm exec vitest run src/orchestration/stale-runs.test.ts
```
结果：15 tests **PASS**

### 可选 e2e
- 未做 API e2e（unit 已钉规则表；成本/价值权衡跳过）

## 残留
- 未 commit / 未 push
- 未改 UI chip / 中文动作映射 → **Slice 64**
- 可选：`classifyRunFailure` 内部可调用 `classifyFailure` 增强（本刀不强制）
- `idle` 文案含 `idle timeout` 时现归 `idle_timeout`（旧 `inferFailureReason` 一律 `idle_watchdog`）——与设计一致

## 给 64 的挂点
- 读 `run.failureReason` 做 chip label/action map（含 5 新档 + 未知降级 `exec_error`）
- 真源枚举：`AgentRunFailureReason.options`
- 规则表：`classifyFailure`（shared）

## Closeout 片段（可选）
- Slice 63 完成：枚举 13 档 + `classifyFailure` 规则表 + run-worker 接线 + unit/typecheck 绿
