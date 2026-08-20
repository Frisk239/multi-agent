# Spec: CmdK 项目上下文直达

日期：2026-08-20
状态：已完成
产品提交：`9130b43 feat(web): add CmdK project context`
上一刀 Intake：`app/.progress/archived-agent-dispatch-fence-intake.md`（通过）
调研：`/root/next_frontend_ux_research_g87`（只读，2026-08-20）

## 用户路径

操作者在任意页面按 `Ctrl+K`，输入项目标题、描述词或本机路径片段；命令面板在独立的「项目」组给出稳定排序的结果、可读状态和已绑定目录提示。按 `Enter` 直接进入 `/projects/:id`。无查询时，也能从「项目」导航入口去项目列表；原有 Esc、方向键、最近访问及其它搜索结果不回退。

## 依据与决策

- 原型把项目列为 workspace 一等信息架构（`chanpin/prototype/assets/js/app.js:16-24`），生产 Sidebar 也已有 `/projects`，但 CmdK 只搜 Issue / Agent / Squad / Wiki。
- Multica 将 Projects 放入 Command Search 的默认导航，并与 Issues 并行搜索，独立分组后直达详情：`references/repos/multica/packages/views/search/search-command.tsx:69-80,426-445,628-665`。
- 本仓已有缓存式 `useProjects()` 和 `GET /api/projects`，项目详情路由可用，因此本刀只补真实导航体验；不新增搜索 API 或 FTS。
- 选定本地、确定性匹配：复用 `rankCandidates` 的稳定排序原则，搜索项目 `title`、`description` 与 `localPath`；项目量增长后另刀再评估服务端搜索。

## Must

1. `CommandPalette` 接入真实 `useProjects()`；空查询的「导航」中加入项目列表入口。
2. 输入查询时，以独立「项目」组显示匹配项目；标题、描述与本机路径均可命中，排序稳定，行内清楚展示项目状态和已绑定 `localPath`（缺路径时不伪造）。
3. 选中项目或按 Enter 跳转 `/projects/:id`，并保持现有关闭面板、Ctrl+K / Esc / 方向键和其它组的行为。
4. 补纯排序/组件测试，覆盖 title/description/path 命中、加载/空结果、键盘跳转以及不破坏现有导航；新增隔离 current-source Playwright：创建唯一项目 → Ctrl+K 搜索标题/描述 → Enter 到详情；空查询也可到 `/projects`。
5. 真实 E2E 使用非默认双端口、独立带 `e2e` 名的 migrated+seed SQLite、CORS/ownership guard 和 finally 清理；不启动 CLI，也不复用共享开发服务。

## Out

- 不加 `/projects/search`、FTS、分页、pin、项目 lead 或第二个“直达项目看板”动作。
- 不改 Project schema、后端 routes、Sidebar、项目详情或看板模型。
- 不重开 Runs、Chat、评论、Automation skipped 或 Agent archive 范围。

## 验收

- 在任意页按 CmdK，唯一项目可由标题、描述和目录片段找到，行内信息不需记 UUID；Enter 后 URL 与详情标题都匹配该项目。
- 空查询存在「项目」导航；现有 Issue / Agent / Squad / Wiki / 导航键语义仍通过回归。
- 单元/组件测试、Web TypeScript 与当前源码隔离 Playwright 均通过；E2E 没有写入默认库或残留 fixture。
