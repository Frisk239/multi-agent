'use client';

import type { AgentRun } from '@ma/shared';
import { RunEventTimelineInline } from './RunEventTimeline';

/** @deprecated 优先用 RunEventTimelineInline；保留兼容旧 import */
export function RunTrace({
  run,
  onOpenDrawer,
}: {
  run: AgentRun | undefined;
  onOpenDrawer?: (runId: string) => void;
}) {
  return <RunEventTimelineInline run={run} onOpenDrawer={onOpenDrawer} />;
}
