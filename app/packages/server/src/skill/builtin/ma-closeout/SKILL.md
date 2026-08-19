---
name: ma-closeout
description: 关刀怎么写：SHA、跑过的命令、债。Roadmap 不是工单。默认可 push main。
---

# 关刀 / 交付说明

本仓工程模式见仓库 `docs/agents/engineering.md`。你收工时按这个写，别发明仪式。

## 最小形状

```markdown
# Closeout: <slug>
- SHA: <git sha>
- 命令: pnpm check → … ; Playwright/e2e → …
- 债: …
```

## 必做

1. 用户路径真的能演示（契约 + 实际用到的 UI）。
2. 证据落 `app/.progress/<slug>-impl-*.md`。
3. 回写 `CONTEXT.md` 方位；若动了 Goal 状态，更新 `design/roadmap.md` §4。
4. 合码：默认 `git push origin main`（人已授权）。高风险才 `feat/*`。

## 不要

- 不要写 content hash / Evidence Bundle。
- 不要把 Goal 编号当成还没做完的「一张大票」继续摊。
- 不要提交 `*.db`、`wiki/`、密钥、`.playwright-cli/`。
