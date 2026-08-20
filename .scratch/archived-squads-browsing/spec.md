# Spec: 历史小队浏览入口

日期：2026-08-20
状态：已完成（closeout：`app/.progress/archived-squads-browsing-impl-1.md`）
上一刀：`memory-project-context`（`app/.progress/memory-project-context-impl-1.md`）

## 用户路径

操作者归档小队后（G2-9 承诺「历史可读」），在小队列表页切到「已归档」tab 找回它：URL 可分享、刷新不丢；归档行显示「已归档 + 时间」标识；点击进入既有只读详情页。active 视图语义完全不变。

## 参考与决策

- ~~服务端三态已就绪~~（Owner 勘误：勘误前误读 agents 路由的归档过滤为 squads 的；squads 列表实际 SQL 硬过滤 active，且该能力被第一刀 Out「archive list」明确排除）→ **本刀含服务端三态**：`GET /api/squads?archived=`（默认 0=active-only、1=仅归档、all=全部），学 agents 路由 `roster.ts:124-134` 模式；`SquadSummary.archivedAt` 契约已在 shared（`schema.ts:1612-1623`）。
- UI 模式沿用 F6-1 scope tabs（`SquadsPage.tsx:379-402`，「全部/我的」role=tablist）。
- 选定独立第三 tab「已归档」（URL `?view=archived`），而非 active 列表混排——归档小队是低频历史查阅，不污染日用列表。

## Must

1. `useSquads(view?: 'active' | 'archived')`（`lib/api/issues.ts:124`）：`archived` 时请求 `?archived=1`，queryKey 区分（如 `['squads', view]`）；默认 active 不加参（兼容既有调用方/缓存）。
2. SquadsPage tabs 加「已归档」tab（`data-testid="squads-scope-archived"`，role=tab）：URL `?view=archived` 持久化（active 时移除参数），刷新/深链可分享；切换只换数据源不动 q/leader/ready 筛选（归档视图下 leader/ready 筛选与「归档」行动按钮隐藏或保持无害——归档行无归档按钮，删除语义只属 active 视图）。
3. 归档行显示「已归档」chip + archivedAt 日期（`data-testid="squad-archived-chip"`，样式对齐 readiness-chip 的 dim 风格）；行名可点击进 `/squads/:id`（既有只读详情自动生效）。
4. 组件测试（扩展 `SquadsPage.test.tsx`）：tab 切换写 URL、归档视图渲染 archivedAt chip、active 视图无 chip、hook view 参数传递；≥4 用例。
5. 隔离 E2E（Owner）：归档一小队 → 切「已归档」tab → 可见且带 chip → 点进只读详情 → 刷新保持 → active 视图不含它。

## Out

- 不做恢复/批量恢复、不改归档语义/服务端、不在归档视图提供任何变更操作。
- 不重开 squad dispatch gate / memory / wiki。

## 验收

- 归档小队在「已归档」tab 可找回且只读；active 列表/默认缓存不受影响；URL 深链直达。
