# Handoff: issue-detail-edit-impl-1

> 切片：`issue-detail-edit` · Slice Owner · 2026-07-17  
> 分支：`feat/issue-detail-edit`  
> 北星：本地可用 · 体验对标 Multica · 关刀 Playwright 硬门禁

## 交付

详情页 **title / description 内联可编辑**（API `PUT` 已有，补 UI 写路径）。

### UI
- `IssueHeader`：标题 button → input（Enter 保存、Esc/空 取消）  
- 描述：展示用 `MarkdownBody`；编辑 textarea + 保存/取消；清空 → `null`  
- 样式：`.issue-title-*` / `.issue-desc-*` / `.btn-secondary`

### 文档 / 流程
- `.scratch/issue-detail-edit/spec.md`  
- `app/.progress/board-priority-triage-intake.md`  
- 迭代约束写入 `docs/agents/workflow.md`、`slice-handoff.md`、`CONTEXT.md`（每刀 Playwright + 定期 Multica 对照）

## 证据

- `pnpm typecheck`：shared / web / server **全绿**
- API：`PUT` title/description / clear description 200（临时 DB）
- **Playwright CLI**（`http://localhost:3000` + API `3001`）：
  1. 打开 `/issues/<FRI-08>`  
  2. 点标题 → 填 `Wiki 标题已编辑 e2e` → Enter → API/H1 均为新标题  
  3. 点描述 → 填 `e2e 描述第一行\n\n- bullet` → 保存描述 → API description 一致  
  4. 回看板：卡片标题显示 `Wiki 标题已编辑 e2e`

## Multica 对照（短）

| 路径 | Multica / 原型 | 本仓本刀后 | 下一刀候选 |
|---|---|---|---|
| 详情改标题/描述 | 主写面 | **已齐**（内联，非大编辑器） | — |
| 看板找/筛 | 强 | 已有 q/label/assignee/priority | 可暂停 filter 线 |
| 小队 mention 委派可见性 | 核心差异 | 有 trigger，体验可再磨 | 候选：mention/briefing 感知 |
| 登录身份「我的」 | 有 | `assignee=any` 近似 | 低优（本地单操作者） |

## 偏离

- 无功能偏离。描述用 Markdown 渲染+源码编辑，非 WYSIWYG（out of scope）。

## 未做 / 债

- 标题 onBlur 也会保存（与 Enter 同路径）  
- 未做富文本 / 附件 / 标题历史  
- 工作流文档变更与本刀同分支（docs+feat 一起 push）

## 下一步（人）

1. CI + 远程合并 `feat/issue-detail-edit`  
2. 勿 commit `wiki/` `*.db`  
3. 下一刀可按上表 **小队/mention 感知** 或你点名  
