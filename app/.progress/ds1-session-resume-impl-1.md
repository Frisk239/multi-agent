# Closeout: DS1 CLI 真 Session Resume（claude-code MVP）

Date: 2026-07-22  
Slug: `ds1-session-resume`  
Branch: `main`（本地 commit；**push 由人手动**）

## 交付

| 层 | 内容 |
|---|---|
| 调研 | `ds1-session-resume-research.md` |
| ADR | `docs/adr/0004-cli-session-resume.md`（Accepted） |
| migrate | `0030_ds1_session_resume.sql`：`provider_session_id` / `resumed_session_id` / `session_resume_status` / `session_poisoned` |
| runtime | `session-resume.ts` prior 选择 + poison + finalize |
| runtime | claude-code：解析 `session_id` + `--resume`；`LineContext`/`ExecutionResult` 透出 |
| worker | execute 前 resolve prior；chat 真 resume 跳过假历史；终态落 session 列 |
| API | reshape / shared `AgentRun` 透出 session 字段 |
| UI | Run 详情诚实展示 session 状态（不支持 / 已复用 / 中毒 / miss） |
| 测试 | `scripts/test-ds1-session-resume.mts` |

## 证据

- `pnpm typecheck` PASS（shared + server + web）  
- `pnpm exec tsx scripts/test-ds1-session-resume.mts` → **ALL PASS**  
  - poison 启发式  
  - finalize resumed / resume_miss / poison  
  - prior 最近 issue run  
  - 源 run 中毒 → poison_fresh  
  - cursor → unsupported  
  - reshape 透出  
- DS4 脚本回归 ALL PASS（无回归）  
- **未**跑真本机 claude CLI 双轮 resume（依赖本机会话存储）；逻辑以 fixture + 决策测覆盖  

## MVP 拍板（已实现）

- 仅 **claude-code** 真 resume  
- poison → **fresh**，禁止假 resume  
- 其它 runtime：`unsupported`，UI 诚实  
- 与 D2 workdir 复用分列展示  

## 偏离

- 未拆 DS1.1/1.2/1.3 为多 commit；本刀一次落地 schema+路径+UI 诚实  
- 未 Playwright（纯 schema/runtime + Run 详情只读条；server smoke + typecheck）  
- issue 无 prior 时仍 fresh；chat 无 prior 仍塞假历史（符合 ADR）  

## Out of scope / 债

- cursor / opencode / grok 真 resume  
- poison 分类全集 / 自动 retry  
- 换 model 强制清 session  
- 真 CLI e2e 双轮 demo（人机可补）  
- Multica force_fresh 双语义  

## 给下一 Owner

- 队列建议：**DS3 Wiki per-project**（必 ADR）  
- 或 DS1 剩余：真 claude 双轮手测；cursor 若有 `--resume` 再开薄刀  
- intake：验 migration 0030 + Run 详情 session 条 + 非 claude 不谎称  

## 相关

- 上一刀 intake：`ds4-token-thinking-intake.md`（通过）  
- 阶段：`phase-ux-deep-2026-07-22.md`  
