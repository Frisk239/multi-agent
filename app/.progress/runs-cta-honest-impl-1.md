# runs-cta-honest-impl-1（Slice 3 · UX gap F5）

Date: 2026-07-21  
Branch: main

## 本刀范围
Runs Mission Control **CTA 按 kind 诚实分支**：chat → 打开会话；QC 无 issue → 重派；issue → 再执行。  
服务端 `retry` 对 chat 明确 400（不说「快速派活」）。Chat 进行中 composer 可 **停止**。

## Multica 对照（短）
- 任务 rerun vs 会话重试路径分离；本仓 `kind` 三元（issue / quick_create / chat）对应三条恢复路径。

## 决策
| 项 | 选择 |
|---|---|
| chat 失败主 CTA | Link「打开会话」`/chat?thread=`（会话内重发） |
| chat retry API | 400 + 指向重发；**禁止**冒充 issue rerun |
| QC 无 issue | 保持「重派」→ `/?quickPrompt=` |
| 在途 chat | 列表/详情也可「打开会话」；详情仍可「停止」 |
| Chat 停止 | composer 旁 `chat-cancel-run` → 既有 cancel API |

## 改动文件
- `web/lib/run-recovery.ts` — `runRecoveryKind` / href helpers
- `web/components/RunsPage.tsx` — RunActions + 任务列会话链
- `web/components/RunDetailPage.tsx` — 顶栏 CTA / chip
- `web/components/ChatPage.tsx` — live 停止
- `web/components/AgentDetailPage.tsx` — agent runs 行
- `web/lib/api.ts` — cancel 后 invalidate chat + toast 回会话
- `server/.../run-service.ts` — `retryRun` chat 分支
- `server/scripts/test-retry-chat-slice3.mts`

## 验收证据
| 项 | 结果 |
|---|---|
| typecheck | 0 |
| chat retry | `test-retry-chat-slice3.mts` PASS（文案含「会话」、不含「快速派活」） |
| Playwright `/runs?status=all` | `runs-row-open-chat`×11 · `runs-chat-thread-link`×11 · issue `runs-row-retry` 仍在 |
| Playwright chat run 详情 | `run-detail-open-chat`=1 · `run-detail-retry`=0 · chat chip |
| Playwright 会话页 | composer + fail resend；无 live 时无 cancel（预期） |

## 下一刀建议
**F1** Project `localPath` per-project cwd；或 **F3** issue idle/wall timeout。

## 不做
- chat 服务端「重发 API」复用 retry 路径
- PriorWorkDir
- Inbox 按 kind 改 retry 按钮（chat 进 inbox 仍少）
