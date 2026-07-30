/**
 * A6 · Product honesty for backends that are not execution-implemented (e.g. Pi).
 * Pure helper shared by server readiness and web assignee filters.
 */

export type RuntimeAssignableInput = {
  /** Backend id, e.g. pi / claude-code */
  runtime: string;
  /** Explicit false means adapter is a stub — never assignable. */
  executionImplemented?: boolean | null;
};

/**
 * Returns false when the adapter is known not to implement real execution.
 * Missing/undefined executionImplemented → treated as implemented (true).
 */
export function isRuntimeAssignableForDispatch(input: RuntimeAssignableInput): boolean {
  if (input.executionImplemented === false) return false;
  return true;
}

export function runtimeUnassignableReason(input: RuntimeAssignableInput): string | null {
  if (input.executionImplemented === false) {
    return `runtime ${input.runtime} 适配器未实现真实执行，禁止指派`;
  }
  return null;
}
