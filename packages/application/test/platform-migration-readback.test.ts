import { describe, expect, test } from "bun:test";

import { ok } from "@appaloft/core";

import { type Query } from "../src/cqrs";
import { type MigrationStepReceipt } from "../src/operations/platform-migrations/migration-apply";
import { createMigrationPlan } from "../src/operations/platform-migrations/migration-plan";
import {
  readMigrationStatus,
  verifyMigrationOutcome,
} from "../src/operations/platform-migrations/migration-readback";

const bundle = {
  apiVersion: "appaloft.io/migration/v1",
  kind: "MigrationBundle",
  metadata: { name: "readback-stateful" },
  spec: {
    project: { name: "Readback Stateful" },
    environment: { name: "production", kind: "production" },
    target: { deploymentTargetId: "srv_readback", destinationId: "dst_readback" },
    resources: [
      {
        ref: "api",
        name: "Readback API",
        source: { kind: "remote-git", locator: "https://github.com/acme/api.git" },
        runtime: { strategy: "auto" },
        network: { internalPort: 3000 },
      },
    ],
    dependencies: [
      {
        ref: "postgres",
        name: "Postgres",
        kind: "postgres",
        sourceMode: "appaloft-managed",
        providerKey: "docker",
        bindings: [{ resourceRef: "api", targetName: "DATABASE_URL" }],
      },
    ],
    volumes: [{ ref: "uploads", name: "Uploads", resourceRef: "api", mountPath: "/data" }],
    domains: [{ hostname: "api.example.test", resourceRef: "api", tlsPolicy: "automatic" }],
  },
} as const;

describe("Platform migration status and verification", () => {
  test("[MIG-READ-005][MIG-VERIFY-007] uses existing queries and emits only bounded safe evidence", async () => {
    const planned = createMigrationPlan(bundle);
    if (planned.isErr()) throw planned.error;
    const receipts: MigrationStepReceipt[] = planned.value.steps.map((step) => ({
      stepId: step.id,
      operationKey: step.operationKey,
      state: "completed",
      output: Object.fromEntries(
        Object.keys(step.produces ?? {}).map((key) => [key, `id_${step.id.replaceAll(":", "_")}`]),
      ),
      ownership: "created",
    }));
    const queryNames: string[] = [];
    const queryDispatcher = {
      execute: async (query: Query<unknown>) => {
        queryNames.push(query.constructor.name);
        if (query.constructor.name === "ResourceHealthQuery") {
          return ok({ status: "healthy", ready: true, token: "must-not-leak" });
        }
        if (query.constructor.name === "DeploymentProofQuery") {
          return ok({ status: "succeeded", phase: "verify", rawLogs: "must-not-leak" });
        }
        if (query.constructor.name.includes("Backup")) {
          return ok({ items: [{ id: "backup_1", status: "completed", secret: "must-not-leak" }] });
        }
        return ok({ id: "safe_id", status: "active", slug: "safe-slug", secret: "must-not-leak" });
      },
    };

    const status = await readMigrationStatus({
      plan: planned.value,
      receipts,
      queryDispatcher,
    });
    const verification = await verifyMigrationOutcome({
      plan: planned.value,
      receipts,
      queryDispatcher,
    });

    expect(status.isOk()).toBe(true);
    expect(verification.isOk()).toBe(true);
    if (status.isErr() || verification.isErr()) throw new Error("readback failed");
    expect(status.value.state).toBe("complete");
    expect(verification.value.state).toBe("passed");
    expect(queryNames).toContain("ShowProjectQuery");
    expect(queryNames).toContain("ResourceHealthQuery");
    expect(queryNames).toContain("DeploymentProofQuery");
    expect(queryNames).toContain("ListDependencyResourceBackupsQuery");
    expect(queryNames).toContain("ListStorageVolumeBackupsQuery");
    expect(
      JSON.stringify({ status: status.value, verification: verification.value }),
    ).not.toContain("must-not-leak");
  });

  test("[MIG-STATEFUL-012] does not treat an empty required backup readback as passed", async () => {
    const planned = createMigrationPlan(bundle);
    if (planned.isErr()) throw planned.error;
    const receipts: MigrationStepReceipt[] = planned.value.steps.map((step) => ({
      stepId: step.id,
      operationKey: step.operationKey,
      state: "completed",
      output: Object.fromEntries(
        Object.keys(step.produces ?? {}).map((key) => [key, `id_${step.id.replaceAll(":", "_")}`]),
      ),
      ownership: "created",
    }));

    const verification = await verifyMigrationOutcome({
      plan: planned.value,
      receipts,
      queryDispatcher: {
        execute: async (query: Query<unknown>) =>
          query.constructor.name.includes("Backup")
            ? ok({ items: [] })
            : ok({ status: "healthy", ready: true }),
      },
    });

    expect(verification.isOk()).toBe(true);
    if (verification.isErr()) throw verification.error;
    expect(verification.value.state).toBe("attention");
    expect(verification.value.evidence.filter((item) => item.queryName.includes("Backup"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evaluation: "attention", summary: { itemCount: 0 } }),
      ]),
    );
  });
});
