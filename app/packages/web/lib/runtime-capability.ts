import type { RuntimeId } from '@ma/shared';

export type RuntimeCapabilityState = 'supported' | 'unsupported' | 'unknown';

export type RuntimeCapabilityCatalog = {
  runtimes: Array<{
    id: string;
    supportsMcpConfig?: boolean;
    supportsCustomArgs?: boolean;
    supportsThinkingLevel?: boolean;
  }>;
};

export function runtimeCapabilityState(
  catalog: RuntimeCapabilityCatalog | undefined,
  runtimeId: RuntimeId,
  capability: 'supportsMcpConfig' | 'supportsCustomArgs' | 'supportsThinkingLevel',
): RuntimeCapabilityState {
  const runtime = catalog?.runtimes.find((item) => item.id === runtimeId);
  if (!runtime) return 'unknown';
  if (runtime[capability] === true) return 'supported';
  if (runtime[capability] === false) return 'unsupported';
  return 'unknown';
}
