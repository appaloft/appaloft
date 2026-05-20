import { describe, expect, test, vi } from "vitest";

vi.mock("$lib/orpc", () => ({
  orpcClient: {
    capabilities: {
      query: vi.fn(async ({ queries }) => ({
        capabilities: queries.map((query: { operationKey: string }) => ({
          operationKey: query.operationKey,
          allowed: true,
          mode: "unrestricted",
          hint: "enabled",
          reason: "test-capability-allowed",
        })),
      })),
    },
  },
}));

import { get } from "svelte/store";

import { capabilityUiState, createCapabilityStore } from "./capabilities";

describe("capability store", () => {
  test("preloaded loader decisions are available before client fetch", () => {
    const store = createCapabilityStore();
    const queries = [{ operationKey: "projects.rename", resourceRefs: { projectId: "prj_demo" } }];

    store.preload(
      [
        {
          operationKey: "projects.rename",
          allowed: false,
          mode: "denied",
          hint: "disabled",
          reason: "viewer-read-only",
        },
      ],
      queries,
    );

    expect(get(store).ready).toBe(true);
    expect(store.decision(queries[0])).toMatchObject({
      allowed: false,
      reason: "viewer-read-only",
    });
    expect(capabilityUiState(store.decision(queries[0]), "disable")).toEqual({
      hidden: false,
      disabled: true,
      reason: "viewer-read-only",
    });
  });
});
