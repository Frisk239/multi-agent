# Intake: issue-labels

> 下一 Slice Owner handoff-based 验收 · 2026-07-17  
> 上一刀：`issue-labels` · 交接：`app/.progress/issue-labels-impl-1.md`

## 结论

**有条件通过**

可进入下一刀短对齐 brainstorm。**无需返工**；下列债不挡产品日常路径，记入债即可。

## 合并 / 分支

| 项 | 状态 |
|---|---|
| `git fetch` | 已做 |
| `origin/main` | `d87392b`（含 `Merge pull request #19 from Frisk239/feat/issue-labels`） |
| 功能合入 | **已合** — `233d80d feat: issue labels catalog, attach, and board filter` + `819e60b docs: mark issue-labels push acceptance done` |
| `233d80d` / `819e60b` 是否 ancestor of `origin/main` | 是 |
| 本地 `main` | 已 `ff` 到 `origin/main`（`d87392b`） |
| 本会话 | **未** `git push origin main`；untracked 运行产物：`app/packages/server/wiki/`、`wiki/`（勿 commit） |

## 对照交接声称

impl-1 声称：票 01–03 同会话交付；标签目录 + 挂载 + 看板筛选；typecheck 绿；API smoke（labels CRUD / set / clear / delete / 回归 200）；偏离无功能点。

### 代码抽查（main）

- drizzle `0012_issue_labels`：`issue_label` / `issue_to_label`
- `routes/labels.ts`：`GET/POST /api/labels`，`PUT/DELETE /api/labels/:id`
- `PUT /api/issues/:id/labels` 全量替换；`Issue.labels` 经 reshape 批量装载
- seed：`bug` / `文档` / `产品` + FRI-11/09/08 挂载
- UI：`IssueCard` chips；`IssueLabelsEditor` 详情挂载+创建；`KanbanBoard` 客户端 label 筛选 pill
- feat 功能 commit 无 `wiki/` / `*.db` / 密钥路径

### 本会话复核证据

1. **`pnpm typecheck`**（`app/`）：shared / web / server **全绿**
2. **API smoke**（临时 `DB_PATH` + PORT=3048，migrate+seed）：

| 检查 | 结果 |
|---|---|
| `GET /api/labels` | 200，≥3（产品 / 文档 / bug） |
| issues 含 `labels`；FRI-11 | `产品` + `文档` |
| `POST /api/labels` smoke-tmp | 201 新行 |
| `PUT /api/issues/:id/labels` set / clear | 200；labels 正确替换/清空 |
| `DELETE /api/labels/:id` | **204** |
| issues / labels / settings/status / wiki/pages / memory / runs / inbox | 皆 **200** |

3. **UI**：本会话 **未** 起完整 `pnpm dev` 做浏览器手点；以代码路径 + API 复核为准（impl 原 handoff 亦注明未浏览器手点）。

## Spec / 票抽查

| 点 | 结论 |
|---|---|
| migrate + seed ≥3 label | 通过 |
| labels CRUD + set issue labels | 通过 |
| Issue list/detail 带 `labels` | 通过 |
| 看板筛选 + 卡片 chip + 详情挂载 | 代码路径通过；浏览器手验未做 |
| 无 parent / attach / agent·skill labels | 范围正确 |
| 票 01–03 Status | `resolved`；Acceptance 已勾 |

## 偏离

与 spec 无未解释功能偏离（与 impl-1「无功能偏离」一致）。标签管理不做独立大页（详情内创建+挂载）。

## 债 / 风险（不挡下一刀）

1. **UI 浏览器手验** — 看板筛选 / 详情勾选本 intake 未重做；人评若要可点一次。  
2. **看板筛选仅客户端** — issues 全量拉取后过滤；量大后再服务端 filter。  
3. **删除 label 硬 cascade** — 无软删除；与 impl 债一致。  
4. **运行产物** — 本地 `wiki/`、`app/packages/server/wiki/` untracked；继续勿 commit。  
5. **CONTEXT.md 方位** — 仍写「本刀进行中 issue-labels」；下一刀开前应改为 prev=`issue-labels` 已 intake、本刀=新人选主题。

## 给下一 Owner

- 上一刀 **已在 main（PR #19）**，不要再走 `feat/issue-labels` 合码流程。  
- 下一主题：人未点名 → **提 2 个候选等人拍板**（产品日常价值）。  
- 仍遵守：push 只 `feat/*`；人远程合并 main。
