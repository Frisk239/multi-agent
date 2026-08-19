# Intake: worker-tick-health-truth

日期：2026-08-19
上一刀提交：`cf53b17`（实现）· `a1fd532`（closeout）

## Verdict：通过

- 合并状态：两笔提交均已推送至 `origin/main`，`HEAD` 是 `origin/main` 的祖先。
- 契约抽检：四 worker 仅在完整 tick 成功后更新心跳；顶层失败写入 failure overlay，下一次成功清零；启动不伪造成功 tick。
- 浏览器抽检：隔离 current-source Server + Next + SQLite 实测 Settings 显示失败 count/摘要/degraded，成功刷新后恢复；真实 `/healthz` 与 ops snapshot 返回三项 failure 字段。
- 回归：定向 53 + 43 + 7 测试、`pnpm check`（128 + 1046 + 508）、`node scripts/check-docs.mjs` 与 `git diff --check` 均通过。Vitest 4 并发配置修复后全量 server 测试稳定通过。
- 安全：未提交 DB、Wiki、临时 fixture、密钥、`.memory/` 或 `.zcode/`。

## 非阻断记录

- loop 内部已处理的 automation rule / Wiki job 业务失败不计为 loop 顶层失败；这是避免把业务级重试噪声伪报为进程失效的范围裁决。

## 下一步

- 取已调研的 Issue 评论线程与结论 UI：根评论 → 一层回复 → 结论/撤销 → 已结论折叠展开；保持 Storyline 和后端线程语义不动。
