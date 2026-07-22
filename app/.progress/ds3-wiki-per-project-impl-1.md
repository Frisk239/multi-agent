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

## Out of scope（本刀不做）

- 自动迁移历史全局 wiki 页到 project
- Memory per-project
- 跨项目联合检索
- jobs 按 project 过滤（队列仍 DB global）
- Playwright 完整 e2e（仓库无独立 wiki playwright 套件；以 server smoke 为主）

## 偏离

- 忽略 `ds3-wiki-per-project-impl-2.md` 虚假 closeout；本文件为真 closeout
- 未启 HTTP 测 routes；store+ingest+meta 形状覆盖主路径
- Playwright：跳过（无现成 wiki e2e harness；Owner 可用 API `?projectId=` + UI 选择器手测）

## 给 Owner 验收

1. smoke + typecheck（上）
2. UI：`/wiki` 选项目 → 横幅变「按项目分根」+ `localPath/wiki`；换项目列表不串
3. 绑 project 的 Issue done → ingest 写到该仓 `wiki/`，并尽力写 `{localPath}/AGENTS.md` MA-WIKI 块
4. 无 project / 路径无效 → 仍写全局根

## 相关

- ADR 0005
- 阶段：`phase-ux-deep-2026-07-22.md`
- 假 closeout（勿信）：`ds3-wiki-per-project-impl-2.md`
