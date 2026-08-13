import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  ApplyPlatformMigrationCommand,
  CleanupPlatformMigrationCommand,
  createMigrationPlan,
  findOperationCatalogEntryByKey,
  PlanPlatformMigrationQuery,
  StatusPlatformMigrationQuery,
  VerifyPlatformMigrationQuery,
} from "../src";

const bundle = {
  apiVersion: "appaloft.io/migration/v1" as const,
  kind: "MigrationBundle" as const,
  metadata: { name: "Fresh web migration" },
  spec: {
    project: { name: "Storefront" },
    environment: { name: "production", kind: "production" as const },
    target: { deploymentTargetId: "srv_prod" },
    resources: [
      {
        ref: "web",
        name: "Web",
        source: {
          kind: "remote-git" as const,
          locator: "https://github.com/acme/storefront.git",
        },
      },
    ],
    variables: [],
    dependencies: [],
    volumes: [],
    domains: [],
  },
};

describe("Platform migration messages", () => {
  test("[MIG-SURFACE-009] all migration surfaces are strict cataloged Query and Command contracts", () => {
    const query = PlanPlatformMigrationQuery.create({ bundle });
    expect(query.isOk()).toBe(true);

    const plan = createMigrationPlan(bundle);
    if (plan.isErr()) throw plan.error;
    const command = ApplyPlatformMigrationCommand.create({
      plan: plan.value,
      confirmedPlanDigest: plan.value.planDigest,
      priorReceipts: [],
    });
    expect(command.isOk()).toBe(true);
    expect(StatusPlatformMigrationQuery.create({ plan: plan.value, receipts: [] }).isOk()).toBe(
      true,
    );
    expect(VerifyPlatformMigrationQuery.create({ plan: plan.value, receipts: [] }).isOk()).toBe(
      true,
    );
    expect(
      CleanupPlatformMigrationCommand.create({
        plan: plan.value,
        receipts: [],
        confirmedPlanDigest: plan.value.planDigest,
      }).isOk(),
    ).toBe(true);
    expect(findOperationCatalogEntryByKey("migrations.plan")?.kind).toBe("query");
    expect(findOperationCatalogEntryByKey("migrations.apply")?.kind).toBe("command");
    expect(findOperationCatalogEntryByKey("migrations.status")?.kind).toBe("query");
    expect(findOperationCatalogEntryByKey("migrations.verify")?.kind).toBe("query");
    expect(findOperationCatalogEntryByKey("migrations.cleanup")?.kind).toBe("command");
    expect(findOperationCatalogEntryByKey("migrations.cleanup")?.transportAccess).toEqual({
      productSession: { minRole: "owner" },
    });
  });
});
