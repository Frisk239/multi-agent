# Implementation Closeout: Notification Preferences & Issue Mute Control

## Work Completed
1. **Frontend Settings Panel (`components/SettingsPage.tsx`)**:
   - Added a "Notification Preferences" (收件箱通知偏好) section in the local Settings page.
   - Implemented granular toggles for:
     - Notification Types: `assigned`, `comment`, `run_completed`, `run_failed`.
     - Severities: `action_required`, `attention`, `info`.
   - The UI accurately links to `GET /PUT /api/settings/inbox-prefs` through `useInboxPrefs` and `useSetInboxPrefs` inside `lib/api.ts`.
   
2. **Frontend Issue-Level Subscription/Mute Control (`components/IssueHeader.tsx`)**:
   - Updated the Subscription button to explicitly handle the `muted` state.
   - When an Issue is muted, the button explicitly states "免打扰 (Mute)". Clicking it subscribes back to the Issue.
   - Tied perfectly to the `POST /api/issues/:id/subscribe` and `unsubscribe` endpoints.

3. **Backend Corrections (`routes/issues.ts`)**:
   - Corrected the `subscribe` endpoint to ensure it effectively overwrites the `muted` reason when re-subscribing. 
   - Used Drizzle's `onConflictDoUpdate` to seamlessly upsert a subscription with the `'manual'` reason.

4. **Validation**:
   - Ran `pnpm typecheck` successfully across the workspace, verifying all types and API schemas match.
   - **0 errors reported**.

All requirements for Slice 6: 通知偏好细粒度与订阅控制 (`notification-preferences-deep`) have been fully implemented.
