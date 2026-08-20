# Closeout: 历史小队浏览入口

日期：2026-08-20
产品提交：`65901d6 feat(squads): archived squads browsing`
上一刀：`memory-project-context`（`app/.progress/memory-project-context-impl-1.md`）

## 已交付

- **服务端三态**（Owner 内联补）：`GET /api/squads?archived=`——默认 `0`=active-only（既有语义零变化）、`1`=仅归档、`all`=全部，学 agents 路由模式；`archivedAt` 投影真实时间戳（原先硬编码 null）。
- **`useSquads(view?)`**（实现子代理）：`archived` → `?archived=1`；queryKey `['squads', view]`，所有失效点（roster/ws 的 `invalidateQueries(['squads'])` 前缀匹配）天然覆盖两个 key，11 个既有调用方语义不变。
- **SquadsPage「已归档」第三 tab**：`?view=archived` URL 持久化、深链可分享；三 tab 互斥；归档视图保留 q 搜索、隐藏 leader/ready 筛选与「归档」按钮（无任何变更操作）；归档行「已归档 · 日期」chip（dim 风格）+ 行名进既有只读详情；tab 计数恒取（RQ 同 key 去重，切换即时）；独立空态「还没有已归档的小队」。
- 测试：SquadsPage 18→25 用例（tab/URL/chip/深链/hook 参数/筛选隐藏/空态）；roster.squads.test.ts 适配（drizzle mock 补 `isNotNull`、GET 用例补 `req.query` 夹具）。

## Owner 勘误（重要，供后续 Owner 避坑）

- spec 初稿「服务端三态已就绪」是**误读**：`roster.ts:124-134` 的归档过滤属于 **agents** 路由；squads 列表此前 SQL 硬过滤 active，且「archive list」被 squad-retirement 刀明确 Out。E2E t2 暴露后 Owner 内联补齐服务端（属本刀合理范围：历史浏览端到端需要它）。
- 教训：引用 file:line 前先确认所在路由/模块归属，grep 相邻行不算核实。

## 验收证据

- 全量 `pnpm -w test`：shared 133、server 125 files / 1082、web 85 files / 605 全绿；typecheck 3 包过。
- 隔离 E2E（复用 squad 刀 DB 的归档小队 + 新建 active 对照，headless Chromium，脚本 `.scratch/archived-squads-browsing/owner-e2e-20260820-1300/archived-tab.e2e.mjs`）：**8/8 PASS**——active 视图不含归档 → 切已归档 tab（URL+chip）→ 刷新保持 → 点进只读详情（note+保存禁用）→ 切回 active 不含 → `?view=archived` 深链直达。截图 `shots/`。
- API 三态实证：`?archived=1` 只回归档小队（带 archivedAt）；默认只回 active。

## 边界 / 债

- 不做恢复/批量恢复；归档视图零变更操作（Out 一致）。
- 归档视图 leader 名对已归档/查无 leader 降级显示 id 文本。
- `.scratch/*/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G3）：G3-3 基础上加厚 Issue/Squad 详情 inline transcript 预览。
- 候选 B（G3）：看板 Issue 卡片项目名投影（projectId → 标题回链，与 memory 刀的 ProjectBadge 模式复用）。
- 候选 C（G5）：Settings/ops 面板汇总归档资源（agent/squad/automation 归档计数入口）。
