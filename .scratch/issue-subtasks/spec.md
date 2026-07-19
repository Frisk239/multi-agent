# issue-subtasks（G1）

## 用户路径

在 Issue 详情：看到「子 issue」区 → 输入标题添加 → 列表出现并链到子卡；子卡详情可见父级面包屑。

## Must

- DB：`issue.parent_issue_id`（nullable，同 workspace）
- 契约：`Issue.parentIssueId` / `parentIdentifier` / `childProgress`
- `CreateIssueInput.parentIssueId`
- `GET /api/issues/:id/children`
- 创建校验：父存在；禁止孙级（父本身已有 parent 则 400）
- 详情 UI：子列表 + 进度 + 添加；子详情父链
- 看板：子卡显示父 identifier 小徽章（不藏子卡）

## Out of scope

- 多级树 / 拖拽排序 / 子 issue 自动推进父状态
- Project 继承（G16）
- Multica daemon sub-issue creation prompt 段落

## 参考

- Multica `parent_issue_id` + `ListChildIssues` + `ChildIssueProgress`
- 本仓 `createIssueCore` 扩展