# Cross-slice kickoff (paste into a new session)

Replace `<PREV_SLUG>` / `<NEXT_THEME>` (or 「待我拍板」).

```markdown
你是本仓 **Slice Owner**（技能 slice-owner；见 AGENTS.md §工程模式、docs/agents/workflow.md、slice-handoff.md、merge.md、ADR 0001/0002）。

## 硬顺序（不要跳）
1) **交接验收上一刀** `<PREV_SLUG>`
2) 写出通过 / 有条件通过 / 需返工 → `app/.progress/<PREV_SLUG>-intake.md`
3) 仅 1–2 通过后，再 **短对齐** 下一刀：`<NEXT_THEME>`
4) 需要则 `.scratch` spec/tickets → implement → push `feat/<slug>`

## 上一刀交接包
- `.scratch/<PREV_SLUG>/spec.md` 与 issues
- `app/.progress/<PREV_SLUG>-*.md`
- CONTEXT.md
- git fetch；人负责远程合并；禁止 push main

先从 git 状态 + 交接包开始，报告验收结论，再进入下一刀对齐。
```
