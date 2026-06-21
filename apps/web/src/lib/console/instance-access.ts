import { get } from "svelte/store";

import {
  type CapabilityDecision,
  type CapabilityQuery,
  capabilities,
  capabilityKey,
} from "$lib/capabilities";

export const instanceAccessCapabilityQuery: CapabilityQuery = {
  operationKey: "system.db-status",
};

export const instanceAccessCapabilityKey = capabilityKey(instanceAccessCapabilityQuery);

let preloadPromise: Promise<boolean> | null = null;

export function instanceAccessDecision(): CapabilityDecision | undefined {
  return get(capabilities).capabilities[instanceAccessCapabilityKey];
}

export function instanceAccessAllowed(): boolean {
  return instanceAccessDecision()?.allowed === true;
}

export function instanceAccessKnown(): boolean {
  return Boolean(instanceAccessDecision());
}

export async function preloadInstanceAccessCapability(): Promise<boolean> {
  if (instanceAccessKnown()) {
    return instanceAccessAllowed();
  }

  preloadPromise ??= capabilities
    .fetch([instanceAccessCapabilityQuery])
    .then(() => instanceAccessAllowed())
    .catch(() => false)
    .finally(() => {
      preloadPromise = null;
    });

  return preloadPromise;
}
