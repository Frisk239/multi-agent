# Spec: Leader briefing 预览

**Status:** resolved  
**Slug:** `leader-briefing-preview`  
**Branch:** main  

## 决策

| 选项 | 选定 |
|---|---|
| 只读预览 vs 编辑 briefing | **只读**（编辑已在小队详情） |
| 放 Run 条 vs 独立面板 | **RunStatusBar 下展开** |
| 无 leader run 时 | 不显示 |

## Must

1. `active.isLeader && squadId` → 拉取 `useSquad`  
2. 展示 Protocol / Roster（@mention 链）/ Directive  
3. 可折叠；默认展开  
4. typecheck + Playwright  
