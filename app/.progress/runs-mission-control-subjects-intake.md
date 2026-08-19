# Intake: runs-mission-control-subjects

日期：2026-08-19
上一刀提交：`20b4ae9`（实现）· `769545c`（closeout）

## Verdict：通过

- 合并状态：两个提交均已在 `origin/main`；本地 `main` 与远端一致。
- 抽检 1：真实 SQLite route contract 覆盖 Issue/chat/独立 QC/无 subject、q/project/交集、createdAt 排序/total，以及 `%`、`_`、反斜杠 LIKE literal escape。
- 抽检 2：隔离 current-source Server + Next + Playwright 实测主文本、项目 chip、Issue/chat nested Link、返回 URL 与 run anchor；14 个检查全过。
- 回归：`pnpm check`（126 + 1035 + 501）和 `node scripts/check-docs.mjs` 均通过；未提交 DB、wiki、密钥或 `.memory/`、`.zcode/`。

## 非阻断记录

- `withAutoRetrySummary` / path-lock 的既有每行 enrich 不在本刀性能范围；subject 投影自身为固定 join，未新增 N+1。
- 搜索是 SQLite ASCII case-insensitive + 中文字面子串，不是 FTS / 拼音搜索。

## 下一步

- 自动进入 `issue-runs-truthful-error-state`：Issue 工作面在 `/api/runs` 失败时显示局部错误与 retry，不能显示“指派 agent 后自动执行”。
