# 合码 — 默认 main 直推（简化）

> 合码**唯一真源**。配套：`AGENTS.md` · [workflow.md](./workflow.md) · [engineering.md](./engineering.md) · [ADR 0007](../adr/0007-engineering-mode-after-hermes.md)  
> 历史：[ADR 0002](../adr/0002-push-triggered-review-remote-merge.md)（**Superseded**，正文「禁推 main」作废）

## 默认路径（2026-07-17 人授权）

```
Slice Owner 做绿（含 Playwright 自测）
  → git commit on main
  → git push origin main
```

- **允许** agent 在 `main` 上开发、提交、推送。  
- **可选** `feat/*`：大实验、并行刀、需要隔离时再用。  
- **不以开 PR 为步骤。**

## 关刀仍要的证据

| 信号 | 要求 |
|---|---|
| `pnpm check` | 绿（= typecheck + 三包 vitest）。**CI 同名**（`.github/workflows/feat-branch-ci.yml`） |
| 文档自检 | `node scripts/check-docs.mjs`（入口文件 + ADR Status + CI 命令冻结） |
| e2e | 起服后 `cd app/packages/server && pnpm e2e --filter <涉及面>`（无服 **SKIP 不假绿**；**不进 CI**） |
| Playwright CLI | 本刀 Must 路径（本机；**不进 CI**） |
| progress | `app/.progress/<slug>-impl-*.md`（SHA + 命令 + 债） |

## 可选审查

- 需要偏见隔离时：本地 `/code-review` 或对某 commit range 审一眼。  
- **不**再把「人远程合并 feat」当作默认闸门。

## 勿提交

`wiki/`、`app/packages/server/wiki/`、`*.db`、密钥、`.playwright-cli/`。
