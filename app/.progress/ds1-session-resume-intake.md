# Intake: DS1 CLI 真 Session Resume

Date: 2026-07-22  
Prev: `a98bd0e` · `ds1-session-resume-impl-1.md` · ADR 0004  
Branch: `main`（本地；push 人手动）

## 核对

| 检查项 | 结果 |
|---|---|
| Commit 在 main | ✅ `a98bd0e feat: claude-code true CLI session resume (DS1)` |
| Migration 0030 | ✅ `app/packages/server/drizzle/0030_ds1_session_resume.sql`：`provider_session_id` / `resumed_session_id` / `session_resume_status` / `session_poisoned` + journal |
| Prior 解析 | ✅ `session-resume.ts`：runtime 门禁 · rerunOf · issue/chat 最近可 resume · poison |
| Claude `--resume` | ✅ `claude-code.ts` argv + `session_id` 解析 → `providerSessionId` |
| Worker 落库 / chat 跳假历史 | ✅ `run-worker.ts` resolve prior + `skipChatHistoryForResume` + finalize |
| Shared / reshape | ✅ `AgentRun` session 字段 + reshape 透出 |
| UI 诚实 | ✅ `RunDetailPage.tsx` `data-session-status` + 不支持 / 已复用 / 中毒 / miss 文案 |
| Smoke | closeout 称 `test-ds1-session-resume.mts` ALL PASS；本 intake **未重跑**（逻辑文件在位） |
| 真 claude 双轮 e2e | ❌ 未做（closeout 已声明债） |
| 非 claude 不谎称 resume | ✅ status=`unsupported` 路径存在 |
| 禁区 | ✅ 无密钥、无 wiki/*.db 进该 commit |

## Spec 抽样 vs 宣称

1. **仅 claude-code 真 resume** — 代码与 ADR 一致  
2. **poison → fresh** — finalize + prior 过滤 `session_poisoned`  
3. **Run 详情 session 条** — UI 有 `sessionResumeLabel`  
4. **未 Playwright** — closeout 已记；本刀为 runtime/schema，可接受

## 债（不挡下一刀）

- 真本机 claude 双轮 resume 手测  
- cursor / opencode / grok 真 resume  
- poison 分类扩展 / 换 model 清 session  

## Verdict

**通过**

下一刀：**DS3 Wiki per-project 根**（ADR 0005 Accepted；当前代码 `perProject: false`，**无** `resolveWikiDir`，勿信任何「DS3 已完成」空 closeout）。
