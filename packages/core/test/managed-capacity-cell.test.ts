import { describe, expect, test } from "bun:test";
import { ManagedCapacityCell } from "@appaloft/core";

describe("Managed capacity cell", () => {
  test("[RESIL-CELL-010] drains before delete and blocks new placement immediately", () => {
    const cell = ManagedCapacityCell.create({
      clusterRef: "cluster:regional-a",
      targetId: "target_regional_a",
      targetPoolId: "pool_production",
      providerKey: "digitalocean",
      region: "nyc3",
      failureDomains: [
        { kind: "provider", key: "digitalocean" },
        { kind: "region", key: "digitalocean:nyc3" },
      ],
      origin: "provisioned",
      lifecycleStatus: "accepting",
      providerResourceDisposition: "delete",
      capabilities: ["kubernetes", "stateful"],
      availableCapacity: 3,
      activePlacementCount: 1,
      estimatedMonthlyCostUsd: 72,
      supportLevel: "standard",
    })._unsafeUnwrap();

    const prematureDelete = cell.delete();
    expect(prematureDelete.isErr()).toBe(true);
    expect(prematureDelete._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: { targetId: "target_regional_a", activePlacementCount: 1 },
    });

    expect(cell.startDrain().isOk()).toBe(true);
    expect(cell.toJSON()).toMatchObject({
      lifecycleStatus: "draining",
      availableCapacity: 0,
      activePlacementCount: 1,
    });
    expect(cell.acceptsNewPlacements()).toBe(false);

    expect(cell.recordActivePlacementCount(0).isOk()).toBe(true);
    expect(cell.toJSON().lifecycleStatus).toBe("drained");
    expect(cell.delete().isOk()).toBe(true);
    expect(cell.toJSON()).toMatchObject({
      lifecycleStatus: "deleted",
      providerResourceDisposition: "delete",
      availableCapacity: 0,
      activePlacementCount: 0,
    });
  });

  test("[RESIL-CELL-010] imported cells retain the external provider resource", () => {
    const cell = ManagedCapacityCell.create({
      clusterRef: "cluster:customer-owned",
      targetId: "target_imported",
      targetPoolId: "pool_production",
      providerKey: "digitalocean",
      region: "sfo3",
      failureDomains: [
        { kind: "provider", key: "digitalocean" },
        { kind: "region", key: "digitalocean:sfo3" },
      ],
      origin: "imported",
      lifecycleStatus: "accepting",
      providerResourceDisposition: "retain",
      capabilities: ["kubernetes"],
      availableCapacity: 2,
      activePlacementCount: 0,
      supportLevel: "community",
    })._unsafeUnwrap();

    expect(cell.startDrain().isOk()).toBe(true);
    expect(cell.toJSON().lifecycleStatus).toBe("drained");
    expect(cell.delete().isOk()).toBe(true);
    expect(cell.toJSON()).toMatchObject({
      lifecycleStatus: "deleted",
      origin: "imported",
      providerResourceDisposition: "retain",
    });

    const unsafeImportedCell = ManagedCapacityCell.create({
      ...cell.toJSON(),
      lifecycleStatus: "drained",
      providerResourceDisposition: "delete",
    });
    expect(unsafeImportedCell.isErr()).toBe(true);
    expect(unsafeImportedCell._unsafeUnwrapErr().message).toBe(
      "Imported managed capacity cells must retain their provider resource",
    );
  });
});
