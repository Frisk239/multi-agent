# Closeout: G8-5a · Run transcript 写前密钥脱敏

日期：2026-08-17  
Spec：`.scratch/g8-trust-execution/spec.md` §G8-5 · `kickoffs/G8-5-transcript-scrub.md`

## 决策与参考

- 调研：[research-transcript-scrub.md](../../.scratch/g8-trust-execution/research-transcript-scrub.md)；上游笔记：[research-transcript-upstream-notes.md](../../.scratch/g8-trust-execution/research-transcript-upstream-notes.md)。
- 对齐 Multica 的同一安全记录先落库、再 publish 的边界（`server/internal/handler/daemon.go:3685-3713`），以及 **redact → truncate** 顺序（`pkg/agent/codex.go:2564-2584`）。Hermes 的流状态机只可借形态，不能代替 secret redaction。
- 因而选择 Worker 的 runtime-output 汇合处，而不是 WebSocket / event bus / API 读取端的全局补救：同一安全观察副本流向 DB、实时事件和 API replay。执行器仍保有原始 tool 参数，绝不为观测而改变下一步执行输入。

## 交付

- 新增 `runtime/secret-scrubber.ts`：不可配置关闭的纯函数 text / JSON-value / stream scrubber。高置信规则覆盖 Bearer、长 `sk-` / `sk-or-`、AKIA、`api_key`、`access_token`、`secret`、`password`、`authorization` 及 `x-api-*`；统一替换为 `[redacted]`，不保留长度、首尾或指纹。
- 结构化 tool 参数和结果深拷贝后脱敏；敏感 JSON key 的任意值（含 object / array）整体替换，未知对象、循环和超深结构 fail-closed。原 runtime object 不会被改写。
- `StreamSecretScrubber` 与既有 memory/think `StreamScrubber` 独立：message delta 与 log 分开持尾，处理前缀/主体/终止符跨 chunk；4 KiB 上限后进入 fail-closed discard-until-delimiter，避免恶意长 token 无限占内存或放出残片。
- `run-worker.ts` 在落库和广播前保护完整 message、tool_start/tool_end、`runtime:event` metadata、`run:progress`、`run:stream_chunk`；fence flush 后仍经过 secret stream flush。
- 终态旁路也在 fan-out 前安全化：`finalText` 到 comment/chat/memory/subagent parser，`result.error` 到 session patch、agent_run、activity、failed event 和失败聊天提示；`failRun` 保留最终 choke point。
- Claude Code、Cursor、OpenCode、Pi 的 structured tool serialization 共用 scrub-then-truncate helper，修复旧 4k 截断可能留下 credential 尾部的风险。

## 验证证据

- 定向 server：5 个文件 / **54** tests 通过；涵盖 pattern/false positive、结构 clone、x-api header、4k 边界、流式 split/flush/overflow，以及 Worker 的 DB、event、comment、memory、chat、activity 与 API replay。
- Server typecheck 通过；Owner 在新迁移的隔离 SQLite、单 worker 下复跑 server 全套：**118** files / **1,012** tests 通过。
- Shared：**6** files / **123** tests 通过；Web：**65** files / **486** tests 通过，web typecheck 通过。
- Playwright（隔离迁移并 seed 的 SQLite、无真实 CLI run）：`/runs/run-g8-safe-ui` 的真实 Run Detail 与 `/api/runs/:id/messages` 回放都只显示 `[redacted]`；tool result 也没有原值，WebSocket 已连接。浏览器仅有既有 `/favicon.ico` 404；server、web 与 browser 均已停止。

## 边界与下一步

- 本刀承诺的是 runtime transcript 的 DB / API replay / 实时观察面；不覆盖宿主 child 原始 stderr/logger sink、历史记录/backups、用户 chat/Issue/comment ingress、未知 token 形状或一般 PII。
- 未迁移的临时 `app/dev.db` 会使既有 `safe-live-restore` 测试缺 `agent_run`；验证始终使用新迁移的隔离 DB。全量并发下另有 SQLite WAL 环境抖动，单 worker 隔离全套已绿；这是测试夹具卫生债，不应误归因于本刀。
- 下一候选为 G8-6：长 transcript 的最新锚定 / 更早加载文案，以及 subagent 树错误显式。G8-4b 仍仅在取得安全 adapter probe 证据后开启。
- 当前 worktree 含 G8-2、G8-3、G8-4a 与其他用户 WIP；未 commit/push，避免混合提交。
