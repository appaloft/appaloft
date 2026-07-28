import { describe, expect, test } from "bun:test";

import {
  configureServerWorkloadRolesInputSchema,
  registerServerInputSchema,
  registerServerResponseSchema,
  serverSummarySchema,
} from "../src";

describe("server workload role contracts", () => {
  test("[SRV-ROLE-001/002] registration defaults empty and validates explicit role sets", () => {
    expect(
      registerServerInputSchema.parse({
        name: "General purpose",
        host: "general.internal",
        providerKey: "generic-ssh",
      }).workloadRoles,
    ).toEqual([]);
    expect(
      registerServerInputSchema.parse({
        name: "Classified",
        host: "classified.internal",
        providerKey: "generic-ssh",
        workloadRoles: ["deployment-runtime", "artifact-builder"],
      }).workloadRoles,
    ).toEqual(["deployment-runtime", "artifact-builder"]);
    expect(
      registerServerInputSchema.safeParse({
        name: "Duplicate",
        host: "duplicate.internal",
        providerKey: "generic-ssh",
        workloadRoles: ["artifact-builder", "artifact-builder"],
      }).success,
    ).toBe(false);
  });
  test("[SRV-ROLE-001/002] registration response exposes canonical persisted role sets", () => {
    expect(
      registerServerResponseSchema.parse({
        id: "srv_general",
        workloadRoles: [],
      }),
    ).toEqual({ id: "srv_general", workloadRoles: [] });
    expect(
      registerServerResponseSchema.parse({
        id: "srv_classified",
        workloadRoles: ["deployment-runtime", "artifact-builder"],
      }),
    ).toEqual({
      id: "srv_classified",
      workloadRoles: ["deployment-runtime", "artifact-builder"],
    });
  });

  test("[SRV-ROLE-012] server readback requires canonical workload roles", () => {
    const summary = serverSummarySchema.parse({
      id: "srv_primary",
      name: "Primary",
      host: "primary.internal",
      port: 22,
      providerKey: "generic-ssh",
      targetKind: "single-server",
      workloadRoles: ["deployment-runtime", "sandbox-worker"],
      lifecycleStatus: "active",
      displayOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(summary.workloadRoles).toEqual(["deployment-runtime", "sandbox-worker"]);
    expect(
      serverSummarySchema.safeParse({ ...summary, workloadRoles: ["unknown-role"] }).success,
    ).toBe(false);
  });

  test("[SRV-ROLE-003/004] role replacement accepts empty and rejects duplicate roles", () => {
    expect(
      configureServerWorkloadRolesInputSchema.parse({
        serverId: "srv_primary",
        workloadRoles: [],
      }).workloadRoles,
    ).toEqual([]);
    expect(
      configureServerWorkloadRolesInputSchema.safeParse({
        serverId: "srv_primary",
        workloadRoles: ["deployment-runtime", "deployment-runtime"],
      }).success,
    ).toBe(false);
  });
});
