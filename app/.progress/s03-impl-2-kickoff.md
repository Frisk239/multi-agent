# S03 impl-2 启动提示词

```markdown
你是 S03 的 **impl-2 执行者**。做 RuntimeBackend 三实现 + detect + RunWorker + runs/runtimes API + PUT 指派即跑 + cancel。
不要做 web UI（除非 typecheck 需要 shared 类型）。

## 前置
- 分支 feat/s03-runtime-backend
- 已读 app/.progress/s03-impl-1.md（验收通过后开工）
- Plan 片段 B Task 2.1–2.3 · spec §5–§8

## 硬约束
- 方案 1：主进程 spawn CLI；Pi 不实现
- progress 仅 WS；run_message 落库；终态 1 条 agent comment
- 取消仅 POST /api/runs/:runId/cancel
- MA_WORKSPACE_CWD；confirm 在前端，你做服务端
- Cursor/opencode argv spike 后钉死并记 handoff
- 三 CLI 尽量真跑自测；未装则 detect false + failed 可读

## DoD
typecheck；API 自测（runtimes / 指派 enqueue / cancel）；handoff s03-impl-2.md；**停**
```
