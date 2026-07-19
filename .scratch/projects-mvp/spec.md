# projects-mvp（G16）

## 用户路径

侧栏「项目」→ 空态创建 → 列表见进度 → 进详情看/挂 Issue → Issue 详情改所属项目 → 看板可按项目筛。

## Must

- DB：`project` 表 + `issue.project_id`
- API：list/get/create/update project；issue 列表 `projectId`；PUT issue 设/清 project
- Issue 契约：`projectId` / `projectTitle`
- UI：`/projects`、`/projects/[id]`、侧栏入口、详情属性选择、看板 project 筛选

## Out of scope

- project resource / 仓库绑定
- lead 多态指派
- 子 issue 自动继承 project（创建时可手设）
- 多租户/云协作