# Closeout: CmdK 项目上下文直达

日期：2026-08-20
产品提交：`9130b43 feat(web): add CmdK project context`

## 已交付

- CmdK 复用已有缓存 `useProjects()`，不新增项目搜索 API；空查询的导航中加入「项目」→ `/projects`。
- 查询时以独立「项目」组呈现项目标题、中文状态和真实本机目录（无目录则明确未绑定）；标题、描述与目录都可命中，`Enter` 直达 `/projects/:id`。
- `rankCandidates` 支持辅助搜索字段；主标签仍是唯一人类可读识别，描述/目录命中不把高亮错画到标题。同名项目以 id 作最后 tie-break，避免接口返回顺序改变键盘首项。
- 加载/无匹配说明不可执行，方向键和 Enter 跳过它们；既有 Ctrl+K、Esc、最近访问和其它命令组保持可用。

## 参考与决策

- 原型把项目列为 workspace 一等 IA：`chanpin/prototype/assets/js/app.js:16-24`。
- 对齐 Multica Command Search 的项目默认导航与独立结果组：`references/repos/multica/packages/views/search/search-command.tsx:69-80,426-445,628-665`。
- 选择本地缓存的确定性搜索，适合纯本地当前规模；后续若项目量增长，再独立评估服务端 FTS/API，不在本刀提前建设。

## 验收证据

- Owner 复跑全量 `pnpm test`：shared 133 tests、server 125 files / 1081 tests、web 83 files / 583 tests，全部通过。
- Web tsconfig 显式 TypeScript 与 E2E 脚本静态 TypeScript 均通过；`node scripts/check-docs.mjs`、`git diff --check` 通过。
- Owner 用全新 migrated+seed 隔离 SQLite 实跑 current-source Playwright：Server `:3174`、Web `:3175`。真实 `Ctrl+K` 标题→Enter→项目详情、描述命中、目录命中、空查询项目导航均 PASS；CORS 和 E2E DB ownership guard 通过，随机项目 finally 清理，未 enqueue 或启动 CLI。
- 冷启动时 SSR Sidebar 先可见、键盘 listener 尚未 hydrate 的竞态已在 E2E 中修复：脚本只反复发送真实 Ctrl+K，直到命令面板实际可交互，不再把静态 DOM 当 readiness。

## 边界 / 下一刀

- 不改 Project schema/routes、FTS、项目详情/看板，也不重开 Runs、Chat、评论、Automation 或 Agent archive。
- `.scratch/cmdk-project-context/` 下两个未跟踪 `owner-e2e-*` 临时目录只含隔离运行物，fixture 已清理，未 stage；不要随源码提交。
- 下一候选：`squad-retirement-dispatch-closure`。按 Multica 采用不可恢复归档 + 原子转 Issue/未归档 Automation 给有效 leader；既有 Squad run 保留历史，不做自动 fallback 或 Agent archive 重开。
