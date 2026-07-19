# projects-mvp · impl-1（G16）

日期：2026-07-19  
HEAD 将推：`main`  
Spec：`.scratch/projects-mvp/spec.md`

## 对照

| 源 | 结论 |
|---|---|
| Multica `project` + `issue.project_id` + issueStats | 容器 + 归属 + done/total |
| 真站 `/projects` 空态「还没有项目」 | 列表 + 新建 + 详情 |
| 本仓 | 无 resource/lead/仓库绑定 |

## 决策

1. **schema：** `project` 表（title/description/status）+ `issue.project_id`。  
2. **API：** CRUD 精简为 list/get/create/update；issue list `projectId`；PUT issue 设/清 project。  
3. **UI：** 侧栏「项目」、`/projects`、`/projects/[id]`、详情属性、看板筛、卡片 badge。  
4. **不做：** resource、lead 多态、自动继承到子 issue。

## 产物

- migration `0018_projects_mvp`
- `routes/projects.ts` + issue/create reshape 扩展
- web：ProjectsPage / ProjectDetailPage / Sidebar / IssueHeader / KanbanBoard / IssueCard

## 证据

- typecheck packages 绿  
- API：POST project 201；POST issue with projectId；GET filter；stats  
- Playwright：`/projects` 列表；详情加 issue 1→2；侧栏入口  

## 下一刀

- G6 `agents-working-banner` / G8 `inbox-archive-section` / G13 agent capability tabs
