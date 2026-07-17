# Handoff: runs-url-mirror-impl-1

> 自动迭代 · main · 2026-07-17

## 选型

`/runs` **URL mirror**（status/agent/leader/run）+ mention 派发链 **具体 runId**（toast + 系统 comment markdown）。

## 交付

- `RunsPage`：`useSearchParams` 驱动筛选；改筛写 URL；`?run=` 行高亮 + scrollIntoView  
- `Suspense` 包一层（Next 要求）  
- 系统派发总结：`[run x…](/runs?run=<uuid>)`  
- toast「查看运行」→ `/runs?run=<id>`（有 runId 时）  

## 证据

- typecheck 绿  
- Playwright：`/runs?status=failed&leader=1` → 1 队长行；`?run=` 高亮；勾选 leader 写回 URL  
- toast href=`/runs?run=…`  
- 系统 comment 含 `/runs?run=` 链  

## 下一刀建议

Inbox 点进 run；或 runs 页 agent 筛选 URL 与 roster 名展示增强。
