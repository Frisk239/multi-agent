# Handoff: s09-impl-2

> 切片：`S09` · 角色：`impl` · 序号：`2`（本切片最后一棒）
> 日期：2026-07-16
> 分支：`feat/s09-memory-provider`
> **基线：** 含 impl-1 + 计划者验收 `a212b68`；本会话完成片段 B 全接线 + 验收。

## 上下文（给下一个会话读）

S09 = Phase 3 可插拔记忆第一刀。impl-1 交付 shared 契约 + `memory_item` migration 0006 + `MemoryProvider` / `SqliteTextProvider(+addRaw)` / `MemoryManager` 纯模块。

impl-2 边界：**prompt 注入 + run-worker completed 写 + REST API + 启动 setExternal**，并做验收。

- spec：[`docs/superpowers/specs/2026-07-16-s09-memory-provider-design.md`](../../docs/superpowers/specs/2026-07-16-s09-memory-provider-design.md)
- 计划：[`docs/superpowers/plans/2026-07-16-s09-memory-provider.md`](../../docs/superpowers/plans/2026-07-16-s09-memory-provider.md) 执行者片段 B（Task 2.1–2.4）
- 前序：[`app/.progress/s09-impl-1.md`](./s09-impl-1.md)

## 本会话完成了什么

- **Task 2.1** `runtime/prompt.ts`
  - import `memoryManager`
  - wiki bridge **之后**、briefing **之前** 调 `prefetchForIssueSync`
  - 顺序固定：`skill → wiki → memory → briefing → body`
  - `buildPrompt` 保持同步
- **Task 2.2** `orchestration/run-worker.ts`
  - import `memoryManager` + `issues`
  - **仅** `run:completed` publish 之后、`try` 内成功路径调用 `syncRunCompleted`
  - `failRun` / `cancelled` 路径 **零** memory 调用
  - 外包 try/catch，失败只 `console.error`
- **Task 2.3**
  - 新建 `routes/memory.ts`：`GET /api/memory/status`、`GET /api/memory?q=&limit=`、`POST /api/memory`
  - `app.ts` register `memoryRoutes`（wiki 后、ws 前）
  - `index.ts`：`setExternal(new SqliteTextProvider())` + `await initialize()`（buildApp 前）
- **Task 2.4** 验收 + 本 handoff

Commits：

| hash | message |
|---|---|
| `cc685dd` | feat(s09): buildPrompt 注入 Memory Context |
| `5ee66a3` | feat(s09): run completed 触发 memory sync |
| `a90d42d` | feat(s09): memory API + 启动注入 SqliteTextProvider |
| （本 commit） | docs(s09): impl-2 handoff |

## 自测结果

**typecheck**（`cd app && pnpm -r typecheck`，全绿）：

```
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

**migration：** `pnpm db:migrate` → `✓ 迁移完成`（0006 已应用）

**API（临时 PORT=3011 起 server）：**

```
GET /api/memory/status
→ {"provider":"sqlite-text","available":true}

POST /api/memory
body: {"text":"S09 test memory: kanban drag prefers position 看板拖拽优先用 position"}
→ 201 { id, scope:"workspace", text:"...", ... }

GET /api/memory?q=kanban
GET /api/memory?q=看板
→ 均命中刚写入条目

GET /api/wiki/pages → 200
GET /api/issues → 200
```

**buildPrompt / sync 脚本验收（测后清理 verify 行）：**

```
prefetchForIssueSync → 含 # Memory Context
buildPrompt(issue)  → YES（含 # Memory Context）
syncRunCompleted(status=completed) → wrote: true
syncRunCompleted(status=failed)    → wrote?: false
```

**rg 约束：**

```
src/orchestration/run-worker.ts
  import memoryManager
  memoryManager.syncRunCompleted  ← 仅 completed 成功路径一处
failRun / cancelled 分支无 memory 调用
```

## 与计划的偏离

1. **POST 201 body：** 优先用 `addCurated` 返回的 `MemoryItemView`（impl-1 已支持 `addRaw` 返回值），无则 fallback 读最新一行；比计划里动态 import 更干净。
2. **手动 curl：** Git Bash 下 inline UTF-8 JSON 曾触发 `Content-Length` 错；改用 `--data-binary @file` 后通过。非代码问题。
3. **无其他偏离。** 未改 shared/migration 形状；未把 buildPrompt async 化。

## 遗留 / 下一个会话要注意的点

1. **切片可合并前：** 计划者按 spec §8 勾验收；建议开 PR 让新会话审 diff（AGENTS.md 流程）。
2. **FRI-11 演示路径：** 成功 completed run 会写记忆；再次 buildPrompt 相关 Issue 可见 Memory Context。失败 run 不写。
3. **S10：** 换 external provider（mem0/向量）时只 `setExternal`；若无 `prefetchSync`，需再考虑 async buildPrompt。
4. **provider 未 setExternal 时：** prompt 不注 memory；POST curated 会 500（provider 不可用）——正常，`index.ts` 已注入。
5. 本地 `dev.db` 验收数据已清理；未提交任何 wiki/tmp 脏文件。

## 验收结论（仅计划者填）

- [x] typecheck 通过 — impl-2 自测全绿
- [x] POST memory → GET ?q= 能搜到
- [x] 有记忆时 buildPrompt 含 `# Memory Context`
- [x] `rg memoryManager run-worker` 仅 completed 一处
- [x] failed/cancelled 零 memory 调用（脚本 + 源码）
- [x] issues/wiki 路由仍注册（HTTP 200）
- [ ] 计划者复核 / PR 审查（待）

- 结论：**<待计划者填：达标合并 / 需返工>**
