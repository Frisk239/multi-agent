import { db } from '../db/client.js';
import { activityLogs } from '../db/schema.js';
import type { ActivityEventType } from '@ma/shared';

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
    db.insert(activityLogs)
      .values({
        id,
        issueId: params.issueId,
        actorType: params.actorType ?? 'system',
        actorId: params.actorId ?? null,
        actorName: params.actorName ?? '系统',
        eventType: params.eventType,
        payload: params.payload ? JSON.stringify(params.payload) : null,
        createdAt: Date.now(),
      })
      .run();
  } catch (err) {
    console.error(`[ActivityLogger] Failed to insert activity for issue ${params.issueId}:`, err);
  }
}
