import { db } from '../db/client.js';
import { activityLogs } from '../db/schema.js';
import type { ActivityEventType, ActivityLog } from '@ma/shared';
import { eventBus } from './event-bus.js';
import { scrubSecretValue } from '../runtime/secret-scrubber.js';

/** Broadcast an activity row that was persisted by a specialized path. */
export function publishActivityCreated(activity: ActivityLog): void {
  eventBus.publish({
    type: 'activity:created',
    issueId: activity.issueId,
    activity,
  });
}

export function recordActivityLog(params: {
  issueId: string;
  actorType?: 'member' | 'agent' | 'system';
  actorId?: string | null;
  actorName?: string;
  eventType: ActivityEventType;
  payload?: Record<string, any>;
}): void {
  try {
    const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAtMs = Date.now();
    const actorType = params.actorType ?? 'system';
    const actorId = params.actorId ?? null;
    const actorName = params.actorName ?? '系统';
    // Activity is persisted and broadcast, so it is a transcript fan-out rather
    // than a logger sink. Clone/scrub values before both boundaries.
    const payload = params.payload == null ? null : scrubSecretValue(params.payload);

    db.insert(activityLogs)
      .values({
        id,
        issueId: params.issueId,
        actorType,
        actorId,
        actorName,
        eventType: params.eventType,
        payload: payload ? JSON.stringify(payload) : null,
        createdAt: createdAtMs,
      })
      .run();

    const activity: ActivityLog = {
      id,
      issueId: params.issueId,
      actorType,
      actorId,
      actorName,
      eventType: params.eventType,
      payload,
      createdAt: new Date(createdAtMs).toISOString(),
    };

    // Slice 71：写入后广播，前端 RQ 可 invalidate / setQueryData
    publishActivityCreated(activity);
  } catch (err) {
    console.error(`[ActivityLogger] Failed to insert activity for issue ${params.issueId}:`, err);
  }
}
