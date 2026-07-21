# inbox-agent-interact · impl-1（G21）

日期：2026-07-21

## 问题

本仓 Inbox 是「运维通知台」（失败条 / pre 正文 / 跳转 Run），不是 Multica 收件箱体验。  
真站源码：`references/repos/multica/packages/views/inbox/components/inbox-page.tsx` — **右侧嵌完整 `IssueDetail`**（评论 composer + 时间线），列表按 issue 去重。

## 决策

| 项 | 选择 |
|---|---|
| 右侧主内容 | 有 `issueId` → 嵌入现有 `IssueDetail`（回复/@mention/轨迹） |
| URL | `?issue=<issueId>`（对齐 Multica）；保留无 issue 时的 `?item=` |
| 列表 | `dedupeInboxItems`：同一 issue 只保留最新一条 |
| 运维失败条 | 默认收起，顶栏「运维」展开（避免盖住 Multica 阅读流） |
| 通知正文 | Markdown 摘要条 + 下方完整 Issue |
| Helper 第三栏 | 本刀不做（仍用全局「问助手」FAB） |

## 证据

- `pnpm --filter @ma/web typecheck` 通过  
- Playwright `localhost:3000/inbox`：列表约 56 行（去重后）、点 FRI-67 →  
  `?issue=…` + `[data-testid=inbox-issue-pane]` + `[data-testid=issue-detail]` + comment composer 可见  

## 文件

- `app/packages/web/components/InboxPage.tsx`  
- `app/packages/web/app/globals.css`（`.inbox-page--multica` / issue pane）

## 未做 / 下一刀

- Inbox 内嵌 Helper 第三栏  
- 列表 actor 真头像（现用 identifier 缩写）  
- 服务端按 issue 聚合未读（现前端去重）  
