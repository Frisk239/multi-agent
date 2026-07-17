# Handoff: bu03-planner-2

> 切片：`补3` / `bu03` · 角色：`planner` · 序号：`2`（整刀验收）  
> 日期：2026-07-17

## 结论

**补3 整刀验收通过**（impl-1 后端+CLI + impl-2 UI）。

| 棒 | 内容 | 状态 |
|---|---|---|
| impl-1 | 0009 可空 issueId、quick-runs、QC prompt/worker、ma issue create、M1 link | ✅ |
| impl-2 | QuickDispatch、cmdk/侧栏、poll、Runs kind 展示 | ✅ |

分支：`feat/bu03-quick-create` @ `5290f60`+（本验收 commit 另推）。  
计划者复验 typecheck 全绿。

## 抽查

- UI：无标题；assignee+prompt；toast；短轮询 issueId  
- 侧栏双按钮（快速派活 + 新建 Issue）— 优于砍掉新建  
- Agent Runs：`quick_create` /「（建卡中）」  

## 下一步（人）

1. **开 PR** `feat/bu03-quick-create` → `main`  
2. 新会话 code review；注意 migration **0009 rebuild agent_run**、`issue_id` 可空  
3. 合 main 后进度表补3 ✅  
4. 可派 **补4**（Settings G0）：kickoff `app/.progress/bu04-planner-0.md`

## 计划者

只验收 + 本文件。
