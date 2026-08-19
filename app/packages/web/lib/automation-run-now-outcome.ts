/**
 * A 201 from run-now only means the server recorded an AutomationRun.  Keep the
 * UI's success claim tied to the domain result, and keep this runtime-safe for
 * servers that introduce a status before the web client is updated.
 */
export type AutomationRunNowOutcome = 'success' | 'warning' | 'error';

export function classifyAutomationRunNowOutcome(
  status: string | null | undefined,
): AutomationRunNowOutcome {
  switch (status) {
    case 'issue_created':
    case 'running':
      return 'success';
    case 'skipped':
    case 'dispatching':
    case 'retrying':
      return 'warning';
    // pending_dispatch deliberately remains an error: the hook supplies its
    // existing repair CTA, while the page expands the persisted run below.
    case 'pending_dispatch':
    case 'failed':
    case 'success':
    default:
      return 'error';
  }
}
