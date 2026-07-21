# Intake: ui-multica-parity-tour + 前序 G21/G22/chat

日期：2026-07-21（跨刀会话）

## 上一刀包

| 项 | 路径 |
|---|---|
| 对照 | `app/.progress/ui-multica-parity-tour-2026-07-21.md` |
| Inbox | `inbox-multica-parity-impl-1.md` · `inbox-agent-interact-impl-1.md` |
| Model | `agent-model-binding-impl-1.md` · `runtime-model-discovery-impl-1.md` |
| Chat | `chat-ui-multica-impl-1.md` |
| 方位 | `CONTEXT.md`（2026-07-21） |

## 合并状态

- 分支：`main...origin/main` 同步
- 工作区：**大量未提交改动**（G21/G22/chat/UI 厚切片等仍在 working tree，尚未 commit/push）
- 结论：功能在本地 tree，**尚未作为干净关刀合入 origin** — 本会话 intake 以 working tree + progress 为准，不重做 G21/G22

## 证据抽查（文档 vs 声称）

| 声称 | 抽查 |
|---|---|
| 侧栏 收件箱/聊天/我的 issue 置顶 | CONTEXT + tour 文档一致 |
| Inbox 嵌 IssueDetail、动态优先 | `inbox-multica-parity-impl-1` |
| agent.model + models 发现 | 有 migration `0021_agent_model.sql` 未跟踪 |
| 缺 G26/G23/G24/G27/G25 | tour §3 + live gap 6b 与用户点名一致 |

## 上一刀债（带入）

1. **未 commit**：整包 parity 改动仍在 dirty tree — 本会话交付时应一并 commit 或拆清
2. Helper 仅 FAB，未嵌收件箱第三栏（G27）
3. Issue 属性非真站右栏（G26）
4. 无独立 my-issues（G24）、无 agents 归档 Tab（G25）
5. Run 事件时间线密度/弹层（G23）

## 判决

**有条件通过** — 文档与代码方向一致，日用路径可用；未 push 的 dirty tree 记为债，**默认仍开下一刀**（用户已点名 G26→G23→G24→G27→G25 全做）。

## 下一刀（人已点名）

厚切片包：`multica-detail-rails`（或分刀同会话连做）

1. G26 Issue 详情属性右栏  
2. G23 运行事件时间线弹层  
3. G24 独立「我的 issue」页 + Tab  
4. G27 收件箱 Helper 第三栏  
5. G25 智能体 已归档 / 我的·全部  

验收硬门槛：Playwright 对照 Multica 真站 + 本仓 E2E。
