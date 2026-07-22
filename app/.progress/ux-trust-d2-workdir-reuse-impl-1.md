# UX Trust D2 — 隔离 workdir 复用叙事

Date: 2026-07-22  
Branch: main

## 本刀范围

| 项 | 内容 |
|---|---|
| Must | UI 明示 isolated_issue 沿用目录；历史列表展示共用 path；脚本证同 issue 路径稳定 |
| Out | 删除隔离目录 API、CLI session resume |

## 决策

| 项 | 选择 |
|---|---|
| 解析 | 不改 `issueIsolatedWorkDir`（已稳定） |
| Run 详情 | isolated_issue / chat_scratch / project_local 说明文案 |
| Issue 历史 | ≥1 条 isolated 时展示 path；多条且 path 相同强调沿用 |

## 改动

- `RunDetailPage.tsx` · `IssueRunHistory.tsx` · `globals.css`
- `scripts/test-workdir-reuse-d2.mts`

## 验收

| 项 | 结果 |
|---|---|
| test-workdir-reuse-d2 | **ALL PASS** |
| typecheck | **PASS** |

## 下一刀

**D3** Run tool 叙事加厚
