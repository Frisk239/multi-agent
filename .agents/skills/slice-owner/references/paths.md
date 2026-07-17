# Slice Owner — artifact paths

| Artifact | Path |
|---|---|
| Spec | `.scratch/<slug>/spec.md` |
| Tickets | `.scratch/<slug>/issues/0N-*.md` |
| Impl / closeout | `app/.progress/<slug>-impl-*.md` |
| Intake (next Owner) | `app/.progress/<prev>-intake.md` |
| Review notes | `app/.progress/<slug>-review.md` |
| Domain / heading | `CONTEXT.md` · `docs/adr/` |
| Workflow prose | `docs/agents/workflow.md` · `slice-handoff.md` · `merge.md` |
| Constitution | `AGENTS.md` |
| Branch | `feat/<slug>` only for `app/**` |

Do not commit: `wiki/`, `app/packages/server/wiki/`, `*.db`, `.playwright-cli/`, `.tmp-*`.
