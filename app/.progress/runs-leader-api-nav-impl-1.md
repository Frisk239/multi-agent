# Handoff: runs-leader-api-nav-impl-1

> 自动迭代 · main · 2026-07-17  
> 选型：**两端**：`GET /api/runs?isLeader=` 服务端筛 + mention toast「查看运行」深链

## 交付

1. `ListRunsQuery.isLeader` + server filter（0/1）  
2. `useWorkspaceRuns({ isLeader })`；`/runs`「仅队长」走 API 不再只客户端 filter  
3. toast 支持 `action: { label, href }`  
4. @提及派发成功 toast → **查看运行** → `/issues/:id`（Run 条所在详情）

## 证据

- typecheck 绿  
- API：failed 2 = leaders1 + non1；`isLeader=1|0` 断言通过  
- Playwright：`/runs` 勾选仅队长 → 1 行 `data-is-leader=1`  
- Playwright：发 @mention → toast 文案含「查看运行」，`.toast-action` href=`/issues/<id>`

## Multica

leader task 列表筛 + 从委派反馈跳到执行面；本刀补齐 API 与导航缝。

## 下一刀建议

`/runs?isLeader=1` URL mirror；或 dispatch 行内链到具体 runId。
