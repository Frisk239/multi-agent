# Closeout: projects-ui-multica

日期：2026-07-21  
HEAD：待推 `main`

## Multica 对照（源码 + 真站）

| 项 | Multica | 本仓决策 |
|---|---|---|
| 列表 | 搜索、状态/优先级/lead 筛、compact 表 / 卡片网格、pin | **搜索 + 状态筛 + 表**；无 lead/pin/grid |
| 进度 | done/total 环/条 | **进度条 + done/total**（`issueStats` 已有） |
| 新建 | 模态 create-project | **页内 ops-form**（与智能体一致） |
| 删除 | admin 可删 | **DELETE API**：先 `issue.project_id=null` 再删容器 |
| 空态 | 「还没有项目 / 创建第一个」 | 保留并统一 EmptyState |
| 详情 | lead、资源、多 tab | **精简**：标题/描述可编、状态、issue 列表+快建、看板链 |

真站当前工作区项目列表为空态；本仓有 seed「验收项目」可演示表与进度。

## 交付

- `DELETE /api/projects/:id` + `useDeleteProject`
- `ProjectsPage`：集合页头、筛选工具栏、data-table、行内改状态、进度条、打开/看板/删除
- `ProjectDetailPage`：对齐 page-header + 卡片分区；标题/描述编辑；删除回列表
- CSS：`projects-page--multica` / progress / inline status

## 证据

- typecheck server/web 绿  
- API：list stats；POST create；DELETE 204  
- Playwright `/projects`：table + search + 1 行进度 0/2  
- Playwright 详情：project-detail + issues 行  

## 刻意不做

- lead / priority 项目级 / pin / 批量 / GitHub 资源  
- 子 issue 自动继承 project（仍可手动挂）
