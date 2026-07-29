export function automationRunHref(runId: string): string {
  return `/runs?run=${encodeURIComponent(runId)}`;
}
