# Must-close 优化清单 · 本目标（2026-07-30）

> 有限集合 = 本 goal 的「目前计划中的优化点」。  
> 历史全量表见 [improvement-analysis-2026-07-30.md](./improvement-analysis-2026-07-30.md)。

## 已关（勿重开）

| ID | 项 | 证据 |
|---|---|---|
| B1 | retry_backoff 队列健康 | `a6d6f03` |
| A1 | opencode/cursor session resume | `c4d45d6`/`29c306b` |
| A3 | ops path-lock holder | `349b948` |
| A5 | Automation run_only | `d869955` |
| A8 | RunTree terminalReason | `b52b5ad` |
| F3 | 故事线 run 去重 | `a6d6f03` |
| F6 | g-chord squads/memory/projects | `349b948` |

## 本目标 Must-close

| ID | 主题 | 状态 |
|---|---|---|
| **F4** | Banner 严重度队列（全局顶多 1 条） | ✅ `banner-queue` + `GlobalBannerStack` |
| **F2** | Issue Sheet 故事线摘要 + 失败主 CTA | ✅ `sheet-work-surface` + `issue-sheet-work-strip` |
| **A6** | Pi 不可派活诚实（hide/hard-block） | ✅ `runtime-assignable` + readiness + AssigneeSelect disabled |
| **F1** | 评论粘贴图/附件最小路径 | ✅ `comment-attachments` + CommentComposer paste |
| **A4** | 灾备含项目级 Wiki 或覆盖报告 | ✅ `project-wiki-roots` + snapshot include |
| **F5** | HelperRail 对齐 Chat 关键路径 | ✅ `helper-chat-path` + fail CTA |
| **Migrate** | 本地 DB migrate 漂移可恢复 | ✅ `safe-migrate` + migrate.ts repair |
| **B3** | 关键 HTTP mutate 契约测 | ✅ `critical-mutate.contract.test.ts` |

## 刻意不做（Out）

- Multica daemon / Redis / 云 webhook / 密钥入库  
- 全量 TipTap / 多 Tab 壳 / Wiki 图谱优先  
- B2 live restore 全量 swap（A4 不要求）  
- Pi 真执行 harness（A6 只做诚实阻挡）  
- Grok ACP / F8/F10/F13 除非顺手  
