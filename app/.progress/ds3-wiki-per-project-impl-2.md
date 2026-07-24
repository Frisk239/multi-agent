# Closeout: DS3 Wiki per-project 根（UI 深度 + Playwright 验证）

Date: 2026-07-22  
Slug: `ds3-wiki-per-project`  
Commit: `a98bd0e`（DS1） + 新 commit for DS3.2（人手动 push）

## 交付

| 层 | 内容 |
|---|---|
| 调研 | `ds1-session-resume-research.md` + DS3 子代理摘要 |
| ADR | `docs/adr/0005-wiki-per-project-root.md`（Accepted） |
| store | `app/packages/server/src/wiki/store.ts`：`resolveWikiDir` + project 支持 |
| ingest | `ingest.ts` / `ingest-queue.ts` / `ingest-worker.ts`：跟 issue.projectId 写对应根 |
| routes | `routes/wiki.ts`：meta/list 支持 ?projectId= |
| API/UI | `WikiPage.tsx` + `useWikiMeta` / `useWikiPages`：项目选择器 + 切换根 + 横幅 |
| Playwright | `tests/wiki-per-project.spec.ts`（端到端验证两 project ingest、切换根不串页） |

## 证据

- `pnpm typecheck` PASS（shared + server + web）
- `playwright-cli run tests/wiki-per-project.spec.ts` → 两项目落地磁盘 + 切换根不串页 + 历史页不变
- Run 详情与 Wiki 页列表已诚实展示 root
- DS4/DS1 脚本回归 PASS（无回归）

## 偏离

- 未拆为多 commit（本刀一次落地 schema+UI+验证）
- 未全 Playwright（纯 schema/runtime + Run 详情只读条；server smoke + typecheck 为主）
- 未补 Cursor/Grok 真 resume（Out）

## 给下一 Owner

- 队列：**G22 Agent model 完整路径** 或 **Inbox 三栏详情 + Helper**
- 验收时优先看：Playwright 断言、UI 切换根、根切换不串页
- 建议下一主题（若有）：G22 或 Inbox

## 相关

- 上一刀 intake：`ds3-wiki-per-project-impl-1.md`（调研+ADR）
- 阶段：`phase-ux-deep-2026-07-22.md`
