# Intake: issue-runs-truthful-error-state

日期：2026-08-19
上一刀提交：`ca2aabe`（实现）· `c4f898f`（closeout）

## Verdict：通过

- 合并状态：两个提交均已在 `origin/main`；本地 `main` 与远端一致。
- 组件抽检：`RunStatusBar` 不再请求 runs；失败、加载、成功空三种状态互斥，retry 只调用传入的 query `refetch`。
- 浏览器抽检：隔离 Server/Next + SQLite 中将目标 Issue 的 runs 请求拦为 500；Issue 主内容仍可见，摘要/运行区显示诚实错误且没有空态；恢复请求后 retry 展示已有真实 run，DB run 数仍为 1。
- 回归：`pnpm check`（126 + 1035 + 504）和 `node scripts/check-docs.mjs` 均通过；未提交 DB、wiki、密钥或 `.memory/`、`.zcode/`。

## 非阻断记录

- query 自动 retry 会继续存在，但最终错误不再在任一 Issue runs 消费者处坍缩为空数组。
- 本刀没有扩大到 comments / activities / attachments 的错误态策略。

## 下一步

- 自动进入 Chat 生命周期切片：标题编辑、归档后确认删除；先以 Multica 与本仓外键/历史 run 约束确定硬删策略，再写契约和 UI。
