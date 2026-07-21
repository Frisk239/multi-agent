# UX Trust B2 — QC 可选 project + 硬闸

Date: 2026-07-21  
Branch: main

## 本刀范围

快速派活可选 project；run 落 `project_id`；cwd = project.localPath；建卡继承 project；UI 预检；readiness 硬闸（A3 已有，本刀加固 UI 不可派活）。

## 决策

| 项 | 选择 |
|---|---|
| 存储 | `agent_run.project_id`（0028） |
| CreateQuickRunInput | 可选 `projectId` |
| 建卡 | origin QC 未传 projectId 时继承 run.projectId |
| 硬闸 | 服务端 409（runtime/cwd_missing/error）；前端 hard block 禁用提交 |

## 改动

- migration `0028_run_project.sql`
- shared AgentRun / CreateQuickRunInput
- quick-runs · run-worker · issue-create · reshape
- `QuickDispatchPanel` 项目 select + exec banner + 硬闸按钮

## 验收

| 项 | 结果 |
|---|---|
| typecheck | PASS |
| migrate | ✓ |
| API POST projectId | run.projectId 正确；cwdMode=project_local · D:\code\multi-agent |
| Playwright 无项目 | isolated 预检 |
| Playwright 有 path | project_local + path |
| Playwright 无效 path | invalid 红条 |

## 下一刀

**B3** 静默点收口（Squad 无 leader / mention / automation enqueue 可解释）。
