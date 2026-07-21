# inbox-multica-parity · impl-1（G21 续）

日期：2026-07-21

## 真站对照（Playwright + 源码）

- 侧栏文案：**收件箱**（非 Inbox）
- 选中通知 → URL `?issue=<id>`
- **右侧 = 完整 IssueDetail**，不是通知 pre：
  - 标题 + 描述（User request）
  - 添加子 issue
  - **动态**（agent/人评论时间线）+ **留下评论**
  - 右侧属性：状态 / 负责人 / 项目 / 父 issue / PR
  - **执行日志**（历史运行折叠）+ Token 用量
  - Helper 浮层（本刀仍全局 FAB）
- 源码：`packages/views/inbox` 嵌 `IssueDetail`；`issue-detail.tsx` 主列 timeline + CommentInput，侧栏 Properties + ExecutionLogSection

## 本仓改动

| 项 | 做法 |
|---|---|
| 侧栏/文案 | `Inbox` → **收件箱**（Sidebar / CmdK / 失败链） |
| 详情结构 | `IssueDetail`：动态+评论置顶；**执行日志默认折叠**（live 自动展开） |
| 去掉 | 右侧「通知摘要」条（真站没有） |
| 巡检噪声 | 规则「验收巡检」**enabled=0**；归档标题含巡检/FRI-6x 指派的未读项 |
| 列表 | 继续 issue 去重 + `?issue=` |

## 巡检是什么

自动化规则 **验收巡检**（`interval_minutes=30`，标题模板 `巡检 {{date}}`）定时建 Issue 并派给队长 → 收件箱出现「已指派 / Run 失败」刷屏。  
**不是**你手动派活。已停用；可在「自动化」页重新启用。

## 证据

- typecheck shared/server/web 通过  
- 真站 `inbox?issue=d23c4042-…` 详情含：动态、回复、属性、执行日志、Token  

## 未做（下一刀）

- 详情内右栏属性条 vs 主列的双栏 resizable（真站 IssueDetail 内再分）  
- Helper 嵌进收件箱第三栏  
- 列表 actor 真头像 / 状态图标  
