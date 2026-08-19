# Intake: chat-title-safe-delete

日期：2026-08-19
上一刀提交：`7e0a63d`（实现）· `6ee01d1`（closeout）

## Verdict：通过

- 合并状态：两个提交均已在 `origin/main`；本地 `main` 与远端一致。
- 契约抽检：标题会 trim，空/超长拒绝；未归档删除 409；归档 zero-run 删除并 cascade 消息；同一会话含 completed 与 running run 时均 409，thread/messages/runs 不变。
- 浏览器抽检：隔离 current-source Server + Next + SQLite，实测改名列表同步、归档确认删除清 URL、消息 cascade，以及含 run 会话的 409 toast 和 `/runs` 保留，共 7 项通过。
- 回归：`pnpm check`（127 + 1039 + 507）和 `node scripts/check-docs.mjs` 均通过；未提交 DB、wiki、密钥或 `.memory/`、`.zcode/`。

## 非阻断记录

- 对带 run 的会话严格保留，故暂不支持其硬删；这是防无 FK `chatThreadId` 断链的产品裁决，不是遗漏。
- 若将来需要删除带 run 会话，必须先独立实现 run 标题快照/关联策略和 active CLI 事务收尾。

## 下一步

- 自动进行后端执行闭环与前端高频路径的 Multica 对照调研，基于证据选择下一条端到端小刀；G8-4b 保持禁开。
