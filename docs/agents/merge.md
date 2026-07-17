# 合码 — 默认 main 直推（简化）

> 真源配套：`AGENTS.md` §工程模式 · [workflow.md](./workflow.md)  
> 历史：[ADR 0002](../adr/0002-push-triggered-review-remote-merge.md)（**已被本简化覆盖**，仅作背景）

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
| `pnpm typecheck` | 绿 |
| Playwright CLI | 本刀 Must 路径（见 workflow 北星约束） |
| progress | `app/.progress/<slug>-impl-*.md` |

## 可选审查

- 需要偏见隔离时：本地 `/code-review` 或对某 commit range 审一眼。  
- **不**再把「人远程合并 feat」当作默认闸门。

## 勿提交

`wiki/`、`app/packages/server/wiki/`、`*.db`、密钥、`.playwright-cli/`。
