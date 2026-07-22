# ADR 0004 — CLI 真 Session Resume（claude-code MVP）

- **Status:** Accepted  
- **Date:** 2026-07-22  
- **Deciders:** Slice Owner（UX Deep DS1）  
- **Refs:** `app/.progress/ds1-session-resume-research.md` · Multica `claude.go` / poison · D2 workdir（非本 ADR）

## Context

同 Issue 再执行 / 同 Chat 下一轮时，用户期望 **CLI 会话上下文**（工具与模型历史）可续，而不只是：

1. **D2 隔离 workdir 复用**（磁盘目录稳定，对话状态仍冷启动）  
2. **Chat 把历史塞进 prompt**（假 resume，上下文膨胀）

Multica 用 `PriorSessionID` + poison 排除 + backend `--resume`。本仓是本地 Node worker + RuntimeBackend，**不**抄 daemon claim / 多机。

## Decision

### 1. MVP 范围

| 项 | 决定 |
|---|---|
| 真 resume runtime | **仅 `claude-code`**（`--resume <session_id>` + stream-json `session_id`） |
| 其它 runtime | **不宣称** resume；可继续 workdir 复用 + chat 假历史 |
| 触发 | issue 再执行 / retry（优先 `rerunOfRunId` 源 run）；chat 同 thread 下一 run |
| 不做 | 跨 runtime 迁 session、daemon 多机、自动 retry 全集、假 resume 伪装真 session |

### 2. 落库（`agent_run`）

| 列 | 含义 |
|---|---|
| `provider_session_id` | 本 run 结束后 CLI 报告的 session（可空） |
| `resumed_session_id` | 本 run **尝试** `--resume` 的 id（可空=fresh） |
| `session_resume_status` | `fresh` \| `resumed` \| `poison_fresh` \| `unsupported` \| `resume_miss` |
| `session_poisoned` | integer 0/1：该 run 的 session **不可**再被后续 resume |

### 3. Prior 解析（worker，execute 前）

1. runtime ≠ `claude-code` → status=`unsupported`，不传 resume  
2. 有 `rerunOfRunId` → 读源 run：同 runtime、有 `provider_session_id`、`session_poisoned=0` → 用其 id  
3. 否则 issue：同 `issueId`+`agentId`+`runtime` 最近一条带可 resume session 的终态 run  
4. 否则 chat：同 `chatThreadId`+`agentId`+`runtime` 同上  
5. 若 prior 存在但已毒 / 无 id → `poison_fresh` 或 `fresh`  
6. 成功选中 prior → `resumed_session_id=prior`，执行后若 CLI 仍报同/新 session 且成功 → `resumed`

### 4. Claude backend

- `ExecutionInput.resumeSessionId?` → argv `--resume`  
- 解析 init/result 行 `session_id` → `ExecutionResult.providerSessionId`  
- 对齐 Multica：`failed` 且 requested≠emitted，或 stderr/错误含 `no conversation found` → **不**把死 id 当可续 session 写回（可空 `provider_session_id`，status=`resume_miss`）

### 5. Poison（最小字面量）

失败文案 / error 匹配（大小写不敏感）任一条 → 本 run `session_poisoned=1`，下次强制 fresh：

- `prompt is too long` / `context_length` / `context overflow` / `context window`  
- `invalid_request_error`  
- `no conversation found`  
- `resume-unsafe`（预留）

**毒 session ≠ 删 workdir。**

### 6. Prompt 策略

- **Chat + 真 resume：** **不注入** `## 会话历史` 块（避免双倍上下文）；可保留一句「已 resume CLI 会话」。  
- **Chat + fresh / 非 claude：** 保持现有 history 注入。  
- **Issue：** 仍用 issue 拼装 prompt（任务态真源）；不把假 chat 历史塞进 issue。

### 7. UI 诚实

Run 详情展示：`session` 短 id + 状态文案（已复用 / 新鲜启动 / 中毒后新会话 / 本 runtime 不支持 resume / resume 未命中）。  
禁止在非 claude 上显示「已 resume」。

## Consequences

### Positive

- 同 issue/chat 多轮可真正接 CLI 上下文（claude）  
- 与 D2 workdir 语义拆开，用户不混淆  
- poison 后自动降级，不装成功

### Negative / Trade-offs

- 仅 claude；cursor/opencode/grok 仍冷启动  
- poison 规则是启发式，可能漏判/误判  
- 依赖本机 Claude 会话存储是否仍在

## Alternatives considered

| 方案 | 为何未选 |
|---|---|
| 四 runtime 齐上 | 旗标与协议不一，易谎报 |
| 旁表 last_session per issue | MVP 用 run 行查询足够；可后优化 |
| Multica force_fresh 双语义 | deep 已告诫 TS 别抄；单义更简 |
| 只加强假 prompt 历史 | 不满足 DS1「真 session」 |

## Implementation notes

- Migration：`0030_ds1_session_resume.sql`  
- 模块建议：`runtime/session-resume.ts`（prior 选择 + poison 检测）  
- 验收：fixture 解析 session_id、prior 选择、poison 标记、chat resume 跳过 history；typecheck  
