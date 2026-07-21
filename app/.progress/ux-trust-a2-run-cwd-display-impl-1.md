# UX Trust A2 — Run 落库 cwd + UI 展示

Date: 2026-07-21  
Branch: main  
Plan: `docs/superpowers/plans/2026-07-21-ux-trust-wave-a.md` Task 2

## 本刀范围

agent_run 持久化 `cwd_path` / `cwd_mode`；API reshape 暴露；Run 详情 / Runs 列表 / Issue 历史展示「工作目录 · 模式 + path」。

## 决策

| 项 | 选择 |
|---|---|
| 存储 | `agent_run.cwd_path` + `cwd_mode`（migration 0026） |
| 写入点 | `run-worker` resolve 后立刻写（成功/失败均写，便于审计） |
| mode 枚举 | 对齐 `resolve-run-cwd`：project_local / workspace / isolated_* / chat_scratch / none |
| 旧 run | 字段 null，UI 不显示块 |

## 改动

- `drizzle/0026_run_cwd.sql` + journal
- `db/schema.ts` · `reshape.ts` · shared `AgentRun`
- `run-worker.ts` 写 cwd
- `RunDetailPage` · `IssueRunHistory` · `RunsPage` · CSS

## 验收

| 项 | 结果 |
|---|---|
| typecheck shared/server/web | PASS |
| migrate 0026 | ✓ 迁移完成 |
| API GET run | `cwdPath` + `cwdMode=project_local` |
| Playwright 详情 `data-testid=run-cwd` | PASS ·「工作目录 · 项目本机」+ path |
| Playwright 列表 `runs-row-cwd` | PASS ·「项目本机」 |

## 下一刀

**A3** — EnvBanner / Settings / QC 文案与默认隔离闸对齐。
