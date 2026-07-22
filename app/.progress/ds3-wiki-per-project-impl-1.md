# Closeout: DS3 Wiki per-project 根

Date: 2026-07-22  
Slug: `ds3-wiki-per-project`  
ADR: [`docs/adr/0005-wiki-per-project-root.md`](../../docs/adr/0005-wiki-per-project-root.md)（Accepted）

## 交付

| 层 | 内容 |
|---|---|
| store | `resolveWikiDir` + `WikiRootOpts`；list/read/write/index/log/raw/ensure 可选根 |
| ingest | issue.projectId → project.localPath/wiki；无效回退 global；`wikiRootOptsForIssue` |
| agents-bridge | project 根更新 `{localPath}/AGENTS.md`；global 仍 workspace/cwd |
| health/lint/query | 透传 root opts，不跨根 |
| routes | `?projectId=` 浏览/写；meta `perProject: true` + source/rootPath/projectId/note |
| web | 项目选择器、`?projectId=`、横幅「按项目分根/全局根」；hooks 带 projectId |
| smoke | `scripts/test-ds3-wiki-per-project.mts` |

## 证据

```
cd app/packages/server && pnpm exec tsx scripts/test-ds3-wiki-per-project.mts
→ ALL PASS（resolve / disk isolation / list-read / health / agents bridge / meta）

cd app && pnpm typecheck
→ shared + server + web Done
```

### Owner 复验（2026-07-22）

| 步骤 | 结果 |
|---|---|
| 迁移 dev.db（缺 `tokens_input` 等列） | `pnpm exec tsx src/db/migrate.ts` ✓ |
| API 写两 project + global | POST `/api/wiki/pages?projectId=` 分盘 `…/wiki/query-Page-A-Only.md` vs B；list 不串 |
| meta | A/B `source=project` + `perProject:true`；无 projectId → workspace 全局根 |
| Playwright CLI | `playwright-cli open http://localhost:3000/wiki` |
| | select `wiki-project-select` → Project A：横幅「按项目分根」+ 仅 `Page A Only` |
| | → Project B：仅 `Page B Only`；URL `?projectId=` |
| | → 全局 Wiki：含 `Page Global Only`，**无** Page A |
| Commit | `266e97f`（实现）+ 本 closeout/intake 补记 |

## Out of scope（本刀不做）

- 自动迁移历史全局 wiki 页到 project
- Memory per-project
- 跨项目联合检索
- jobs 按 project 过滤（队列仍 DB global）

## 偏离

- 忽略 `ds3-wiki-per-project-impl-2.md` 虚假 closeout；本文件为真 closeout
- 实现窗初版未跑 Playwright；**Owner 路径验收已补 Playwright CLI**

## 给下一 Owner

1. 队列：**G22 Agent model 完整路径**（binding + discovery 已有；补洞：CLI `--model` 诚实、未装 runtime、与 thinking 边界）
2. 勿再开 DS3 全量迁移
3. 本地 dev 起服前若 schema 落后：`packages/server` 下 `pnpm exec tsx src/db/migrate.ts`

## 相关

- ADR 0005
- 阶段：`phase-ux-deep-2026-07-22.md`
- DS1 intake：`ds1-session-resume-intake.md`（通过）
- 假 closeout（勿信）：`ds3-wiki-per-project-impl-2.md`
