import { get, type Readable, writable } from "svelte/store";

import { orpcClient } from "$lib/orpc";

export type CapabilityMode = "unrestricted" | "constrained" | "denied";
export type CapabilityPolicy = "disable" | "hide";

export type CapabilityResourceRefs = {
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  deploymentId?: string;
  dependencyResourceId?: string;
  storageVolumeId?: string;
  [key: string]: string | undefined;
};

export type CapabilityQuery = {
  operationKey: string;
  organizationId?: string;
  resourceRefs?: CapabilityResourceRefs;
};

export type CapabilityDecision = {
  operationKey: string;
  allowed: boolean;
  mode: CapabilityMode;
  hint: string;
  reason: string;
  details?: Record<string, unknown>;
};

export type CapabilitySnapshot = Record<string, CapabilityDecision>;

export type CapabilityState = {
  capabilities: CapabilitySnapshot;
  ready: boolean;
};

export type CapabilityStore = Readable<CapabilityState> & {
  preload(decisions: readonly CapabilityDecision[], queries?: readonly CapabilityQuery[]): void;
  fetch(queries: readonly CapabilityQuery[]): Promise<readonly CapabilityDecision[]>;
  decision(query: CapabilityQuery): CapabilityDecision;
  allowed(query: CapabilityQuery): boolean;
};

const defaultDeniedDecision = (query: CapabilityQuery): CapabilityDecision => ({
  operationKey: query.operationKey,
  allowed: false,
  mode: "denied",
  hint: "disabled",
  reason: "capability-not-loaded",
});

export function capabilityKey(query: CapabilityQuery): string {
  return JSON.stringify({
    operationKey: query.operationKey,
    organizationId: query.organizationId ?? null,
    resourceRefs: query.resourceRefs ?? {},
  });
}

export function createCapabilityStore(
  initial: readonly CapabilityDecision[] = [],
): CapabilityStore {
  const state = writable<CapabilityState>({
    capabilities: Object.fromEntries(
      initial.map((decision) => [capabilityKey({ operationKey: decision.operationKey }), decision]),
    ),
    ready: initial.length > 0,
  });

  function preload(
    decisions: readonly CapabilityDecision[],
    queries?: readonly CapabilityQuery[],
  ): void {
    state.update((current) => {
      const next = { ...current.capabilities };
      decisions.forEach((decision, index) => {
        next[capabilityKey(queries?.[index] ?? { operationKey: decision.operationKey })] = decision;
      });
      return { capabilities: next, ready: true };
    });
  }

  return {
    subscribe: state.subscribe,
    preload,
    async fetch(queries) {
      const response = await orpcClient.capabilities.query({ queries: [...queries] });
      preload(response.capabilities, queries);
      return response.capabilities;
    },
    decision(query) {
      return get(state).capabilities[capabilityKey(query)] ?? defaultDeniedDecision(query);
    },
    allowed(query) {
      return this.decision(query).allowed;
    },
  };
}

export const capabilities = createCapabilityStore();

export function capabilityUiState(
  decision: CapabilityDecision,
  policy: CapabilityPolicy = "disable",
) {
  return {
    hidden: !decision.allowed && policy === "hide",
    disabled: !decision.allowed && policy === "disable",
    reason: decision.allowed ? undefined : decision.reason,
  };
}
