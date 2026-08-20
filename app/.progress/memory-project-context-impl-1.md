# Closeout: Memory 项目上下文闭环

日期：2026-08-20
产品提交：`373c2bf feat(memory): project-context filtering and naming`
上一刀：`squad-retirement-dispatch-closure`（`app/.progress/squad-retirement-dispatch-closure-impl-1.md`）
调研：`app/.progress/memory-project-context-discovery-2026-08-20.md`

## 已交付

- **queryKey 三态**（`lib/api/memory.ts`）：`memoryProjectFilterKey` 把 undefined→`__all__`、null→`__global__`、ID→原值；queryFn 语义不变（undefined 不传参、null 传空参、ID 传值），缓存不再串档。
- **MemoryPage 项目筛选**（实现子代理交付，Owner 验收）：`?project=` URL 唯一真源（缺失=全部、空值=仅全局、ID=项目+全局）；picker 选项「全部项目/仅全局/各项目名」，URL 指向已删项目时补「已删项目 <id8>…」option 保持诚实。
- **ProjectBadge**（表格行 + 详情「项目边界」共用）：项目存在→名称回链 `/projects/:id`；已删→不可点击 fallback；无→「全局」。
- **创建默认归属**：URL 带有效项目时 curated 创建自动携带 `projectId`，创建区显示「归属：项目名」；无效/未选不强塞。
- **ProjectDetailPage「项目记忆」入口** → `/memory?project=<id>`。
- 顺手修同容器旧隐性 bug：active-filters/scope-only chip 不显示（项目 chip 复用同容器必改）。

## 分工

- 实现子代理：Must 1-6（4 文件 + MemoryPage.test.tsx 10 用例）。
- Owner：spec/短对齐、diff seam 抽查、隔离 E2E（Must 7）、回归、提交关刀。

## 验收证据

- `pnpm -w typecheck` 3 包过；全量 `pnpm -w test`：shared 133、server 125 files / 1082、web 85 files / 598（+10）全绿；`check-docs` ok。
- 隔离双端口 E2E（Web `:3100` + API `:3101` + fresh migrated SQLite，脚本 `.scratch/memory-project-context/owner-e2e-20260820-1240/memory-ctx.e2e.mjs`，headless Chromium）：**15/15 PASS**——
  - API 三态隔离：全量含 3 条；P1 视图=alpha+global 不泄漏 beta；仅 global 不含项目记忆。
  - UI：默认全量 → picker 选 alpha → URL `?project=` 且过滤 → 刷新保持 → 仅全局 → 项目详情「项目记忆」直达 → 创建默认归属（API 证实 `projectId=P1`）+ 归属提示 → 表格名称回链 → 删除 beta 项目后记忆保留 + 不可点击 fallback → 全量视图 beta 记忆不迁移不消失。截图 `shots/`。
- 本环境 IAB webview 不可用，浏览器路径以 headless Chromium 真实 GUI 替代（同 squad 刀）；未启动 CLI、未污染开发库。

## 边界 / 债

- select 哨兵 `__global__` 理论可与同名项目 ID 碰撞（现有 cuid 风格 ID 实际风险可忽略）；后续如引入短 ID 需换哨兵机制。
- `memory-project-link/deleted` 在表格与详情抽屉两处渲染，E2E/测试需用 within/allBy 定位（已在测试中处理）。
- 服务端三态本就绪，本刀零 server/shared 改动。
- `.scratch/memory-project-context/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G3）：Agent 环境变量编辑 UI/API（roadmap §3 现状基线标注的唯一 UI/API 双缺项）。
- 候选 B（G3）：G3-3 基础上加厚 Issue/Squad 详情 inline transcript 预览。
- 候选 C（G2）：归档小队「历史小队」浏览入口（服务端 `?archived=1` 已支持，Web 无 UI）。
