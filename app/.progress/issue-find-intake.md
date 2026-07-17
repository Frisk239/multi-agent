# Intake: issue-find

> 下一 Slice Owner handoff-based 验收 · 2026-07-17  
> 上一刀：`issue-find` · 交接：`app/.progress/issue-find-impl-1.md` · spec `.scratch/issue-find/spec.md`

## 结论

**有条件通过**（合并已确认后仍标「有条件」仅因浏览器手验未做；**不挡**下一刀）

可进入下一刀短对齐：`issue-assignee-desk`（候选 A，人已点名）。

## 合并 / 分支

| 项 | 状态 |
|---|---|
| `git fetch`（经本机 `127.0.0.1:7890` 代理） | 成功 |
| `origin/main` | **`806a6e3`** `Merge pull request #20 from Frisk239/feat/issue-find` |
| 功能合入 | **已合** — `fdba931` + `7946b77` 均为 `origin/main` ancestor |
| 本地 `main` | 已 `ff` 到 `origin/main`（`806a6e3`） |
| 本会话 | **未** `git push origin main`；untracked：`wiki/`、`app/packages/server/wiki/`、本 intake（勿 commit 运行产物） |

## 对照交接声称

impl-1：服务端 `q`/`labelId`/`status`；标签软归档；看板 URL 筛选；CmdK 服务端 Issue 搜 + Agents + 键盘；typecheck 绿；API smoke；浏览器未完整手点。

### 代码抽查（main）

- drizzle `0013_issue_find`：`issue_label.archived_at`
- shared：`ListIssuesQuery`；`IssueLabel.archivedAt`
- routes：issues 查询过滤；labels 软归档 + 清 junction；挂载拒归档
- web：`useIssues(params)`、`KanbanBoard`、`CommandPalette`

### 本会话复核证据

1. **`pnpm typecheck`**（`app/`）：shared / web / server **全绿**（intake 初轮）
2. **API smoke**（临时 `DB_PATH`，PORT=3052，migrate+seed 后）：

| 检查 | 结果 |
|---|---|
| `GET /api/labels` | 3 活跃，`archivedAt=null` |
| `?labelId=lbl-product` | FRI-09 / FRI-11 |
| `?q=FRI-11` | FRI-11 |
| `?q=PRD` | FRI-09 / FRI-11 |
| `DELETE /api/labels/lbl-docs` | **204**；默认目录剩 产品/bug |
| `?includeArchived=1` | 文档 `archivedAt` 真 |
| FRI-11 labels | 仅「产品」（junction 已清） |
| 再挂 `lbl-docs` | **400** 不能挂载已归档 |
| `?labelId=lbl-docs` | **400** 无效或已归档 |
| issues / labels / settings/status / wiki/pages / memory / runs / inbox | 皆 **200** |

3. **UI 浏览器**：仍未完整 `pnpm dev` 手点 CmdK ↑↓ / 看板 URL（债保留，不挡）。

## Spec / 票抽查

| 点 | 结论 |
|---|---|
| 服务端筛选 + 软归档 | 代码 + smoke 通过 |
| 看板 / CmdK 路径 | 代码路径通过 |
| 票 01–03 | `resolved` |
| Out of scope | 未越界 |

## 偏离

无未解释功能偏离。浏览器手验为证据缺口。

## 债 / 风险（不挡下一刀）

1. ~~未合 main~~ — **已合 PR #20**（本会话复核）。  
2. **浏览器手验** — CmdK / 看板 URL 刷新未点。  
3. **`q` 进程内 filter** — 非 FTS；本地量级 OK。  
4. **无 unarchive UI** — 刻意 out of scope。  
5. **看板 drag 与筛选 cache** — 可能交错。  
6. **运行产物** — `wiki/`、`app/packages/server/wiki/` untracked；继续勿 commit。  
7. **Shell 代理** — 本机 GitHub 需 `HTTP(S)_PROXY=http://127.0.0.1:7890`（7890 有监听）；后续 fetch/push 注意。

## 给下一 Owner / 本会话

- 上一刀 **已在 main（PR #20）**，新刀从 **`main`** 开 `feat/*`。  
- 人点名下一刀：**A `issue-assignee-desk`**。  
- 仍遵守：push 只 `feat/*`；人远程合并 main。
