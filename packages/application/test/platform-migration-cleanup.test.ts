import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import { type Command, type Query } from "../src/cqrs";
import { type MigrationStepReceipt } from "../src/operations/platform-migrations/migration-apply";
import { cleanupMigrationPlan } from "../src/operations/platform-migrations/migration-cleanup";
import {
  createMigrationPlan,
  type MigrationPlan,
} from "../src/operations/platform-migrations/migration-plan";

const bundle = {
  apiVersion: "appaloft.io/migration/v1",
  kind: "MigrationBundle",
  metadata: { name: "cleanup-web" },
  spec: {
    project: { name: "Cleanup Web" },
    environment: { name: "production", kind: "production" },
    target: { deploymentTargetId: "srv_cleanup", destinationId: "dst_cleanup" },
    resources: [
      {
        ref: "web",
        name: "Cleanup Web",
        source: { kind: "remote-git", locator: "https://github.com/acme/web.git" },
        runtime: { strategy: "auto" },
        network: { internalPort: 3000 },
      },
    ],
    variables: [
      {
        key: "PUBLIC_ORIGIN",
        value: "https://cleanup.example.test",
        exposure: "runtime",
      },
      {
        key: "API_MODE",
        value: "production",
        exposure: "runtime",
        resourceRef: "web",
      },
    ],
    volumes: [
      {
        ref: "data",
        name: "Cleanup Data",
        resourceRef: "web",
        mountPath: "/data",
      },
    ],
    domains: [{ hostname: "cleanup.example.test", resourceRef: "web", tlsPolicy: "automatic" }],
  },
} as const;

function receiptsForPlan(plan: MigrationPlan): MigrationStepReceipt[] {
  return plan.steps.map((step) => {
    const id = `id_${step.id.replaceAll(":", "_")}`;
    const output = Object.fromEntries(Object.keys(step.produces ?? {}).map((name) => [name, id]));
    return {
      stepId: step.id,
      operationKey: step.operationKey,
      state: "completed",
      output,
      ownership: "created",
    };
  });
}

describe("Platform migration cleanup", () => {
  test("[MIG-CLEAN-008] cleans only owned receipts in reverse dependency order", async () => {
    const planned = createMigrationPlan(bundle);
    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) throw planned.error;
    const receipts = receiptsForPlan(planned.value);
    const executed: string[] = [];

    const result = await cleanupMigrationPlan({
      plan: planned.value,
      confirmedPlanDigest: planned.value.planDigest,
      receipts,
      commandDispatcher: {
        execute: async (command: Command<unknown>) => {
          executed.push(command.constructor.name);
          return ok({ id: "cleaned" });
        },
      },
      queryDispatcher: {
        execute: async (_query: Query<unknown>) =>
          ok({
            schemaVersion: "resources.show/v1",
            resource: { id: "id_resource_create_web", slug: "cleanup-web" },
          }),
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value.state).toBe("completed");
    expect(executed).toEqual([
      "CleanupDeploymentRuntimeCommand",
      "ArchiveDeploymentCommand",
      "DeleteDomainBindingCommand",
      "DetachResourceStorageCommand",
      "UnsetResourceVariableCommand",
      "ArchiveResourceCommand",
      "DeleteResourceCommand",
      "CleanupStorageVolumeRuntimeCommand",
      "DeleteStorageVolumeCommand",
      "UnsetEnvironmentVariableCommand",
      "ArchiveEnvironmentCommand",
      "ArchiveProjectCommand",
    ]);
  });

  test("[MIG-CLEAN-008] preserves reused receipts and rejects a different digest", async () => {
    const planned = createMigrationPlan(bundle);
    if (planned.isErr()) throw planned.error;
    const receipts = receiptsForPlan(planned.value).map((receipt, index) =>
      index === 0 ? { ...receipt, ownership: "reused" as const } : receipt,
    );
    const executed: string[] = [];

    const result = await cleanupMigrationPlan({
      plan: planned.value,
      confirmedPlanDigest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      receipts,
      commandDispatcher: {
        execute: async (command: Command<unknown>) => {
          executed.push(command.constructor.name);
          return ok({ id: "cleaned" });
        },
      },
      queryDispatcher: { execute: async () => ok({ slug: "cleanup-web" }) },
    });

    expect(result.isErr()).toBe(true);
    expect(executed).toEqual([]);
  });

  test("[MIG-CLEAN-008] preserves the volume record when runtime cleanup is blocked", async () => {
    const planned = createMigrationPlan(bundle);
    if (planned.isErr()) throw planned.error;
    const receipts = receiptsForPlan(planned.value);
    const executed: string[] = [];

    const result = await cleanupMigrationPlan({
      plan: planned.value,
      confirmedPlanDigest: planned.value.planDigest,
      receipts,
      commandDispatcher: {
        execute: async (command: Command<unknown>) => {
          executed.push(command.constructor.name);
          return command.constructor.name === "CleanupStorageVolumeRuntimeCommand"
            ? ok({ summary: { blockedCount: 1, skippedCount: 0 } })
            : ok({ id: "cleaned" });
        },
      },
      queryDispatcher: {
        execute: async (_query: Query<unknown>) =>
          ok({
            schemaVersion: "resources.show/v1",
            resource: { id: "id_resource_create_web", slug: "cleanup-web" },
          }),
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value).toEqual(
      expect.objectContaining({
        state: "partial",
        remainingStepIds: expect.arrayContaining(["volume:create:data"]),
        failure: expect.objectContaining({
          stepId: "volume:create:data",
          operationKey: "storage-volumes.delete",
        }),
      }),
    );
    expect(executed).toContain("CleanupStorageVolumeRuntimeCommand");
    expect(executed).not.toContain("DeleteStorageVolumeCommand");
  });
});
