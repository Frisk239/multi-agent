# Handoff: runs-leader-badge-impl-1

> 自动迭代 · main · 2026-07-17

## 决策

选 **Runs 列表 isLeader 可见 + 仅队长筛选**（相对 mention→Run 滚屏更易 E2E、工作区级可诊断）。

## 交付

- `/runs` 表：`队长` badge、`data-is-leader`、小队链接  
- 筛选「仅队长 run」客户端 filter  
- typecheck 绿  

## Playwright

1. seed：FRI-11 mention→agt-prd run + rerun leader run（均 failed 无 cwd）  
2. `/runs` 默认 failed：2 行，1 个队长 badge，1 行 `data-is-leader=1` + squad  
3. 勾选仅队长 → 1 行  

## Multica

leader task 在列表可辨；本仓 API 已有 isLeader，本刀补工作区壳。

## 下一刀建议

mention 派发 toast 链到 `/runs` 或 issue Run 条；或 runs API `isLeader=1` 服务端筛选。
