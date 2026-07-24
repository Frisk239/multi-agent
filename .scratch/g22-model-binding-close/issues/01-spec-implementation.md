# Implementation Spec for g22-model-binding-residual-honor

**Goal:** Clean up the run snapshot output to remove any residual honesty flags.

## Backend Changes (app/packages/server/)

### 1. Backend snapshot logic
- Edit `app/packages/server/src/services/run.service.ts` (or equivalent backend run service)
- Remove `honestyFlag` or `effort` flag from snapshot serialization.

### 2. Frontend Display
- Edit `app/packages/web/src/components/runs/RunDetailPage.tsx`
- Clean display logic for snapshot: strip any residual flags.

## Changes Summary
- Backend: remove flag
- Frontend: clean display

Tested with Playwright.