# 调研：CmdK 项目上下文直达

日期：2026-08-20
结论：取 `cmdk-project-context` 作为下一刀（主 Goal：G3）。

## 本仓差距

- 项目已经是 Sidebar 的一等实体，且 `useProjects()` / `GET /api/projects` / `/projects/:id` 都可用；但 `CommandPalette` 只接 Agent、Squad、Wiki 和 Issue 搜索，无法从全局入口按项目语义直达。
- 项目使用本机目录这一执行上下文，若 CmdK 只能看到 UUID 或根本搜不到项目，会让操作者在跨项目切换时失去最快的定位路径。

## 对标

- 原型把项目放在 workspace IA：`chanpin/prototype/assets/js/app.js:16-24`。
- Multica 的 Command Search 同时纳入项目默认导航与并行搜索，按独立结果组展示后直达详情：`references/repos/multica/packages/views/search/search-command.tsx:69-80,426-445,628-665`。

## 决策

采用缓存项目列表上的本地、确定性搜索：标题、描述、本机路径都可命中；复用 `rankCandidates` 的稳定排序原则。该做法适合纯本地日用规模，避免在已有项目读取能力之上先造一层不需要的 FTS/API。

## 边界与后续

- 本刀必须含 UI、真实导航和隔离 Playwright，不做 API-only 补丁。
- 不做服务端项目搜索、pin、项目看板第二动作或模型改造。
- 后端调研同时发现的下一候选是 `squad-retirement-dispatch-closure`：当前 hard delete 会留下 Automation/历史 run 的 Squad 悬挂引用；Multica 采用 archive + 转 leader。该题与 CmdK 用户路径无关，留为后续独立厚刀。
