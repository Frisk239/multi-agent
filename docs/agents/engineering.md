# 工程操作模型（短）

> 真源： [ADR 0007](../adr/0007-engineering-mode-after-hermes.md) · 合码 [merge.md](./merge.md) · 循环 [workflow.md](./workflow.md)  
> 对照 Hermes pipeline：**学** Slice Owner / Must-Out / 关刀写 SHA / Roadmap 不是工单；**不学** 禁推 main、产品 Pipeline、hash 仪式。

## 默认循环

```
intake → 探索子代理 → Owner 拍板 → 实现子代理 → 路径验收
  → pnpm check + Playwright → commit + push origin main → closeout（SHA + 命令 + 债）
```

| 门 | 谁跑 | 挡落地？ |
|---|---|---|
| `pnpm check` | 本机 + CI | 是（本机关刀）；CI 是信号 |
| Playwright / `pnpm e2e` | 本机（需 :3000/:3001） | 关刀 Must；无服 e2e **SKIP 不假绿** |
| `/code-review` | 可选新会话 | **否** |
| 文档自检 `node scripts/check-docs.mjs` | 本机 + CI | CI 红则修文档 |

## 不是工单

`design/roadmap.md` 的 Goal / §4 队列 = 路线。实现单位是一刀 Must/Out。不要把「G8 还没全关」当成一张票去实现。

## 工程词（勿与产品词混用）

| 工程词 | 含义 | 不是 |
|---|---|---|
| **Slice / 刀** | 一条可演示用户路径 | 看板上的 Issue |
| **Slice Owner** | 本会话编排者 | 产品里的 Agent |
| **Closeout** | `app/.progress/<slug>-impl-*.md` | Wiki ingest |
| **Goal 队列** | roadmap §3–§4 | Automation 规则 |
| **Intake** | 验上一刀 | Inbox 通知 |

## 关刀最小形状

```markdown
# Closeout: <slug>
- SHA: <git sha>
- 命令: pnpm check → … ; Playwright/e2e → …
- 债: …
```
