# Closeout: 工程模式对照 Hermes 对齐

日期：2026-08-19  
Slug：`eng-mode-hermes-align`  
SHA：待 commit

## 决策

学 Hermes ADR-0031：Slice Owner、Must/Out、Roadmap 不是工单、关刀写 SHA。  
不学：禁推 main、产品 Pipeline、hash 仪式、husky 硬闸。  
本仓合码继续 [merge.md](../../docs/agents/merge.md) main 直推（[ADR 0007](../../docs/adr/0007-engineering-mode-after-hermes.md)）。

## 交付

- ADR 0007 + `docs/agents/engineering.md` + TRACEABILITY
- 回写 0001/0002、handoff、issue-tracker、_TEMPLATE、AGENTS、CONTEXT
- CI：`pnpm check` + `node scripts/check-docs.mjs`（入口/ADR Status/命令冻结）+ 负例自测
- `permissions: contents: read`、`persist-credentials: false`

## 证据

```
node scripts/check-docs.mjs          → ok
node --test scripts/check-docs.test.mjs → pass
```

未跑全量 `pnpm check`（本刀无 app 代码）。Playwright 不适用。

## 债

- AgentBuilderWizard thinking 门控仍未做
- 无 lint 栈（刻意 Out）
- e2e 仍不进 CI
