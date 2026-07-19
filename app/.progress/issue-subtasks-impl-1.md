# issue-subtasks · impl-1（G1）

日期：2026-07-19  
HEAD 将推：`main`  
Spec：`.scratch/issue-subtasks/spec.md`

## 对照

| 源 | 结论 |
|---|---|
| Multica `parent_issue_id` + `ListChildIssues` + `ChildIssueProgress` | 扁平 `parent_issue_id`；按 number 序；done+cancelled 计完成 |
| Multica UI「添加子 issue」 | 详情区列表 + 行内添加 |
| 本仓 | 无 project 继承；**仅一层**（子不可再挂孙） |

## 决策

1. **schema：** `issue.parent_issue_id` + index；migration `0017_issue_subtasks`。  
2. **契约：** `Issue.parentIssueId` / `parentIdentifier` / `childProgress`；`CreateIssueInput.parentIssueId`。  
3. **API：** `createIssueCore` 校验父存在 + 禁孙级；`GET /api/issues/:id/children`。  
4. **list/detail reshape** 批量装 parent identifier + child progress。  
5. **UI：** `IssueSubtasks`（详情）+ 父面包屑 + 看板 `↳ 父` / `done/total`。  
6. **不做：** 多层树、拖拽、子完成自动推进父、project 继承。

## 产物

- `app/packages/server/src/db/schema.ts` + `drizzle/0017_issue_subtasks.sql`
- `reshape.ts` / `issue-create.ts` / `routes/issues.ts`
- `shared` Issue 契约
- `IssueSubtasks.tsx` · `IssueDetail` · `IssueHeader` · `IssueCard` · CSS

## 证据

- `pnpm -r --filter './packages/*' typecheck` 绿  
- API：POST 子 issue 201；children 列表；parent.childProgress；孙级 400  
- Playwright：`/issues/<parent>` 见子区 `0/2`；表单添加 FRI-52；子页 crumb `FRI-50/FRI-52`；看板 parent/children badge  

## 偏离 / 债

- 无  
- 可选下一刀：`projects-mvp`（G16）/ `agents-working-banner`（G6）/ `inbox-archive-section`（G8）

## 给下一 Owner

- intake 本刀：API children + 详情子区 + 看板 badge  
- 再下一刀建议：`projects-mvp` 或 G6 全局「N 个智能体工作中」
