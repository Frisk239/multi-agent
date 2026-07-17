---
name: slice-owner
description: "Run this repo's Slice Owner flow for product slices — intake the previous closeout, short-align the next cut, implement on feat/*, push for CI/review, close out. Use when the user opens a Slice Owner session, starts a 跨刀/产品演进切片, says 验上一刀/intake, 下一刀/短对齐, or wants the AGENTS.md engineering mode instead of planner/executor dual roles."
---

# Slice Owner

You are the **Slice Owner** for one vertical cut in this monorepo. One session owns intake → align → ship evidence → push → closeout. You may write `app/**` on a feature branch.

**True sources (do not restate wholesale):** `AGENTS.md` §工程模式 · `docs/agents/workflow.md` · `docs/agents/slice-handoff.md` · `docs/agents/merge.md` · ADR 0001/0002. Path table: [references/paths.md](references/paths.md). Kickoff paste: [references/startup-template.md](references/startup-template.md).

## Hard order (cross-slice session)

Do not skip. Do not open a full implement on a **new** theme before step 2 concludes **通过** or **有条件通过**.

### 1. Orient + load handoff pack

1. Read `CONTEXT.md` and git: `git fetch`; branch vs `origin/main`.
2. Load previous slug pack: `.scratch/<prev>/spec.md`, issues Status, `app/.progress/<prev>-*.md` (impl / closeout / review).
3. Note untracked runtime junk (`wiki/`, `*.db`) — never commit it.

**Done when:** you can name prev slug, merge state (in main / still on feat / unknown), and where evidence lives.

### 2. Intake previous slice

Lightweight verification — not re-implementation, not `git push origin main`.

| Check | Action |
|---|---|
| Merge | Is feat commit an ancestor of `origin/main`? Record; do not merge as agent |
| Evidence | Re-run or spot-check typecheck / smoke claimed in progress |
| Spec vs claim | Sample 2–3 acceptance items; list debt |
| Safety | No secrets; no wiki/db in the feature commit |

**Write** `app/.progress/<prev>-intake.md` (or Comments on prev impl) with exactly one verdict:

| Verdict | Next |
|---|---|
| **通过** | Step 3 |
| **有条件通过** | Record debt; default still step 3 unless human says fix first |
| **需返工** | Stay on prev / hotfix branch; **defer** step 3 |

**Done when:** intake file exists and verdict is stated to the user.

### 3. Short-align next slice

Only after 通过 / 有条件通过 (or pure **续作** same slug — then skip to step 4).

1. Theme from human; if empty, propose **two** product-value candidates from CONTEXT + debt — wait for pick.
2. **短对齐** only: Must / Out of scope / slug / branch / 2–3 tickets if needed. Default **no** full `/grill-with-docs` unless domain/ADR-hard decision.
3. Research: user says 调研 / 对齐 multica / 查 references → **subagent or `/research`**; merge **summary + file:line + 与本仓差异** only. Do not paste large upstream into this window.
4. Confirm scope with human when choices remain (e.g. debt bundle D1/D2).

**Done when:** human has approved scope (or scope is forced by existing ready tickets). Optional: write `.scratch/<slug>/spec.md` + `issues/0N-*.md`.

### 4. Implement on `feat/<slug>`

1. Branch from current main line: `feat/<slug>`.
2. Prefer `/implement` and `/tdd` at agreed seams; keep vertical slice demoable.
3. Evidence as you go: typecheck, API smoke, hand-check notes in progress or ticket Comments.
4. Update ticket Status / acceptance when done.

**Done when:** acceptance for in-scope tickets is met or residual debt is explicit.

### 5. Push, review, human merge

1. `git push -u origin HEAD` on `feat/<slug>` — **never** `git push origin main`.
2. CI typecheck on `feat/**`. Optional/new session: `/code-review` fixed point `origin/main...HEAD` (or merge-base..HEAD). No requirement for a PR URL.
3. Tell human: remote-merge when CI + review ok. PR UI is optional plumbing, not the ceremony center. See `docs/agents/merge.md`.

**Done when:** branch is on origin and human has clear merge instructions.

### 6. Closeout

Write `app/.progress/<slug>-impl-*.md` (or extend): delivery, evidence, deviations, debt, next-owner notes. Refresh `CONTEXT.md` 当前方位 (prev intake / this feat / next TBD).

**Done when:** a later Owner can intake without chat memory.

## Continuations

| Case | Behavior |
|---|---|
| **续作** same slice (window full) | `/handoff`; next session **skips** new-theme step 3; resume tickets on same `feat/*` |
| **跨刀** | Always steps 1–2 first |
| Foreign bug / fog | `/triage` or `/diagnosing-bugs` / wayfinder — then re-enter as Owner |

## Guardrails (positive)

- Ship **product-daily value**, not答辩清单 numbering.
- Prefer reference-project decisions via **research subagent**, then Owner decision.
- Keep secrets and runtime trees out of git.
- Bias isolation = **branch review + CI**, not planner/executor dual roles (historical names in old progress files are not the live workflow).

## Skill routing (this repo)

| Need | Reach |
|---|---|
| Spec / tickets from thread | `/to-spec` · `/to-tickets` |
| Build tickets | `/implement` · `/tdd` |
| Branch review | `/code-review` |
| Session compact | `/handoff` |
| Which Matt skill | `/ask-matt` |
| Full grill + ADR | `/grill-with-docs` only when domain-hard |

After this skill finishes a cross-slice open, the user should have an intake verdict and either a blocked rework path or a scoped next cut in flight or pushed.
