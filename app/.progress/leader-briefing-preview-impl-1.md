# Handoff: leader-briefing-preview-impl-1

> 自动迭代 · main · 2026-07-17  
> 选型：只读预览挂 RunStatusBar（不改 agent loop / 不重复编辑小队字段）

## 交付

- `RunStatusBar`：`isLeader && squadId` → `useSquad` → Protocol / Roster / Directive 预览  
- 可折叠；链到小队设置  
- CSS `.leader-briefing-*`  
- 修 hooks 顺序（useSquad 在 early return 前）

## Multica

| | Multica | 本仓 |
|---|---|---|
| claim 注入 briefing | daemon + squad_briefing | prompt.ts 已有 |
| 人眼可见 | 任务上下文强 | **本刀补 UI 预览** |

## 证据

- typecheck 绿  
- Playwright：FRI-11 leader failed run → 面板 `data-testid=leader-briefing-preview`；正文含 Protocol / Roster / Directive / 产品小队  

## 下一刀建议

Run 列表展示 isLeader；或 mention 派发后自动滚到 Run 条。
