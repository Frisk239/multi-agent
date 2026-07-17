# Closeout: label-board-links

## 证据

- typecheck 绿（`@ma/web` tsc --noEmit）
- Playwright：
  - 详情 `issue-label-board-link` → `/?label=5de86ed4-…`，chip「标签 · 验收 ×」，可见 1 卡
  - 卡片 `issue-card-label-link` href 同标签

## 交付

- `IssueLabelsEditor`：已挂标签芯片 → 看板筛选；目录行「看板」同链
- `IssueCard`：标签芯片 `Link` + `stopPropagation`（不抢开详情）
- CSS：`issue-label-chip--link` / `issue-label-board-btn`

## 决策

- 对齐已有 assignee/origin 深链：`/?label=<id>` 可分享，不另造全局标签页

## 再下一刀建议

- Multica 差距：运行中心失败恢复闭环 / squad 运营密度 / automation 规则列表可搜
