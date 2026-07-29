export const DAY0_STORAGE_KEY = 'ma.day0-onboarding.v2';
export const DAY0_SESSION_KEY = 'ma.day0-onboarding.v2.dismissed';

const LEGACY_LOCAL_KEYS = ['ma.onboarding.v1', 'ma-onboarding-dismissed'];
const LEGACY_SESSION_KEYS = ['ma.onboarding.dismissed'];

export type Day0StoredState = {
  version: 2;
  completed: true;
  completedAt: string;
  issueId?: string;
  runId?: string;
};

export function readDay0Completed(storage: Storage): Day0StoredState | null {
  const raw = storage.getItem(DAY0_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Day0StoredState>;
    return value.version === 2 && value.completed === true && typeof value.completedAt === 'string'
      ? (value as Day0StoredState)
      : null;
  } catch {
    return null;
  }
}

export function writeDay0Completed(
  storage: Storage,
  destination: { issueId?: string | null; runId?: string | null },
): Day0StoredState {
  const value: Day0StoredState = {
    version: 2,
    completed: true,
    completedAt: new Date().toISOString(),
    ...(destination.issueId ? { issueId: destination.issueId } : {}),
    ...(destination.runId ? { runId: destination.runId } : {}),
  };
  storage.setItem(DAY0_STORAGE_KEY, JSON.stringify(value));
  return value;
}

export function migrateDay0Storage(local: Storage, session: Storage): void {
  for (const key of LEGACY_LOCAL_KEYS) local.removeItem(key);
  for (const key of LEGACY_SESSION_KEYS) session.removeItem(key);
}
