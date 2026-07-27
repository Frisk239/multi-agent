# Slice 54 · Mention chips 薄版（U13）· impl-1

> 2026-07-27 · 实现子代理 · 未 commit / 未 push

## 交付

| 路径 | 内容 |
|---|---|
| `packages/web/lib/mention-chips.ts` | `parseMentionChips(body)` / `removeMentionFromBody(body, id)` |
| `packages/web/lib/mention-chips.test.ts` | 解析 / 去重 / 删 chip 同步 body 单测 |
| `packages/web/components/CommentComposer.tsx` | sticky chips 行；× 调 remove 同步 markdown |
| `packages/web/app/globals.css` | `.composer-mention-chips` / chip / remove 样式 |
| `packages/server/scripts/e2e-slice54-mention-chips.mts` | @ 选择 → chip → 删 →（可选发送） |

## Must

1. ✅ `CommentComposer`：选择 mention 后编辑区下方 sticky chips 可见
2. ✅ 可删 chip 并同步 markdown（去掉对应 `[@…](mention://…)`）
3. ✅ 发送后仍走既有 body → timeline `MarkdownBody` pill（不改协议）
4. ✅ Playwright e2e `e2e-slice54-mention-chips.mts`
5. ✅ 单测 `lib/mention-chips.test.ts`
6. ✅ typecheck web
7. ✅ progress 本文件

## Out

- TipTap 全量
- 附件
- hover card 1:1 Multica

## testids

- `composer-mention-chips`
- `composer-mention-chip`（`data-mention-kind` / `data-mention-id`）
- `composer-mention-chip-remove`
- 既有 `mention-autocomplete-menu` / `comment-composer-textarea` / `comment-submit-btn`

## 设计要点

- chips **派生自 body**（`parseMentionChips`），不另存 state → 与 draft-storage 不冲突
- 语法与 `MarkdownBody` / server `comment-trigger` 对齐：`[@label](mention://agent|squad/<id>)`
- 删 chip：`removeMentionFromBody` 按 id 去掉全部匹配 md，折叠行内多余空格

## 验收

```bash
cd D:/code/multi-agent/app/packages/web
pnpm exec vitest run lib/mention-chips.test.ts --reporter=dot
pnpm typecheck
cd ../server && pnpm exec tsx scripts/e2e-slice54-mention-chips.mts
```

## 证据（本地）

- `pnpm exec vitest run lib/mention-chips.test.ts` → 1 file, **9 passed**
- `pnpm typecheck`（@ma/web）绿
- `pnpm exec tsx scripts/e2e-slice54-mention-chips.mts` → pass=6 fail=0
  - @ 选择 → chip 可见（`agt-lead` + mention md）
  - 删 chip → body 同步清 md
  - 再选 + 发送 → timeline pill + marker 可见
