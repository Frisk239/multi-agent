# Slice 75 Intake

**Short-align**  
- **Theme:** Process Lifecycle Hardening (P0)  
- **User path:** SIGTERM/SIGINT → no orphan runs (Windows tree kill + residual reaper) + health card green  
- **Must:** killTree util + integrate with spawn-line / run-control / graceful-shutdown / process-health / stale-runs / healthz  
- **Out:** cloud, secrets, multica daemon 1:1, rich text, virtual list (done)  
- **Seams:** graceful-shutdown.ts, spawn-line.ts, run-control.ts, process-health.ts, index.ts, settings health card, e2e-slice75-shutdown.mts  
- **Acceptance:** unit (graceful-shutdown + new tree-kill) + Playwright SIGTERM test (no orphans, health green) + typecheck + main push  

**Phase G plan update:** Slice 75 P0 done; next 76 Memory breaker (already done) / 77 Delegation / 78 WS / 79 Virtual scroll.  
