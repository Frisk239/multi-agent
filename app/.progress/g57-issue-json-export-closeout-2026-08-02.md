# G5-7 Issue/看板 JSON 导入导出 —— closeout（2026-08-02 第四波 M4）

**刀名：** G5-7 Issue/看板 JSON 导入导出（看板快照 JSON；迁移场景）
**Goal：** G5（可靠性与运营）/ 目标 M4 体验与低价值收尾

## 设计决策

- **快照格式 v1**：`{version: 1, exportedAt, workspaceId, issues: [...]}`；导出字段 = title / description / priority / status / assignee{type,id} / labels / projectId / customFields / stage。**identifier/position 不导出**（导入重新生成，避免跨库冲突）；父引用不导出（跨库迁移父 id 无意义，v1 诚实裁剪）。
- **导入静默建卡**：`enqueue: false`（迁移场景不触发 run，避免导入即开活）；labels 照 create handler 口径校验（存在/未归档），坏 label 该条 failed 并继续；逐条 try/catch，返回 `{ok, created, failed: [{title, error}]}`。

## 改动清单

| 文件 | 改动 |
|---|---|
| `shared/schema.ts` | + `IssueExportItem` / `IssueExportV1` / `IssueImportInput` / `IssueImportResult` |
| `server/routes/issues.ts` | + `GET /api/issues/export?projectId=`（快照导出）· `POST /api/issues/import`（逐条 createIssueCore + labels） |
| `web/components/KanbanBoard.tsx` | 工具栏 + 「导出 JSON」（下载 kanban-snapshot-日期.json）·「导入 JSON」（文件选择 → 解析 → POST → 结果提示 + refetch）· `kanban-export-json` / `kanban-import-json` / `kanban-import-file` / `kanban-json-notice` testid |

## 测试与实证

- `routes/issues.export-import.test.ts`（新，契约测试，真实内存迁移 DB + 真实 sqlite.transaction）：
  - 导出：快照 version/workspace 字段、单条含 priority/status/assignee/labels/customFields、**不含 identifier**；
  - 导入：有效条 created + 坏 label 条 failed 精确计数；导入卡 status/assignee/labels 落库；**enqueue=false 不产生 run**。
- `pnpm typecheck` 全绿（shared/web/server）。
- **实证（验收标准：单 issue 或看板快照 JSON；迁移场景）**：真实库导出 344 条快照（version=1）→ 取前 3 条回导 → `created=3 failed=0` roundtrip 闭环；测试数据已清理（bulk-delete 3 条 + 停 server）。
- UI：看板工具栏按钮（Playwright 关刀统一验证）。

## 下一刀建议

M4 其余项（G3-7 体验 / G2-5 全局并发 / G1-5 pgvector 软回退）按余力取舍；随后最终验收（全量门禁 + Playwright 证据 + 回写 roadmap/CONTEXT + push）。
