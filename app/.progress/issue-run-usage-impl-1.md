# issue-run-usage · impl-1（G4）

日期：2026-07-19  
对标：Multica Issue 详情 Token/用量 + 历史运行密度

## 范围

| 项 | 落地 |
|---|---|
| API | `GET /api/issues/:id/run-usage` |
| UI | Issue 运行历史上方用量条 + 历史表「耗时」列 |
| Token | 字段保留但恒 `null`（本地 CLI 无计量；文案明示） |

## 契约 `IssueRunUsage`

total / completed / failed / cancelled / active · successRate · avgDurationMs · totalDurationMs · lastRunAt · tokens*

## 验收

- API 200 样例 issue  
- Playwright：`[data-testid=issue-run-usage]` 显示次数/成功率/耗时；历史表有 duration 列  
- typecheck 通过  

## 非目标

- 不解析 CLI 日志估 token  
- 不做工作区级用量页（G17）
