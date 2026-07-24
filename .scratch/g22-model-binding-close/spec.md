# Spec: g22-model-binding-residual-honor

**Simple vertical cut for residual honesty closure in Agent model binding (G22).**

**North Star:** Make run snapshot output clean — no residual honesty flags in frontend/frontend print or backend backend print. Ensure clean output for daily console usability.

**Must:**
- Remove any `--effort` or honesty flag from run snapshot output (both backend and frontend).
- Ensure clean print in AgentDetailPage.tsx and run tracing.
- Typecheck + Playwright smoke path: "open run detail, see clean output".
- No breaking changes to existing squad/mention flow.

**Out of scope:**
- Full model binding UI overhaul.
- Multi-agent squad expansion.
- Any other G22 residual (honesty only).

**Acceptance:**
- Run snapshot shows clean output (no flags).
- Playwright test passes for detail page.

**Thickness:** One demoable path: Inspect a completed run → see clean snapshot.