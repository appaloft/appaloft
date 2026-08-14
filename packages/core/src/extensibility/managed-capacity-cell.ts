import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import {
  type ManagedClusterFailureDomainKind,
  type ManagedClusterFailureDomainSnapshot,
  type ManagedClusterSupportLevel,
} from "./managed-cluster-topology";

export type ManagedCapacityCellOrigin = "provisioned" | "imported";
export type ManagedCapacityCellLifecycleStatus =
  | "accepting"
  | "draining"
  | "drained"
  | "deleted"
  | "failed";
export type ManagedCapacityCellProviderResourceDisposition = "delete" | "retain";

export interface ManagedCapacityCellSnapshot {
  clusterRef: string;
  targetId: string;
  targetPoolId: string;
  providerKey: string;
  clusterName?: string;
  region: string;
  failureDomains: ManagedClusterFailureDomainSnapshot[];
  origin: ManagedCapacityCellOrigin;
  lifecycleStatus: ManagedCapacityCellLifecycleStatus;
  providerResourceDisposition: ManagedCapacityCellProviderResourceDisposition;
  capabilities: string[];
  availableCapacity: number;
  activePlacementCount: number;
  estimatedMonthlyCostUsd?: number;
  supportLevel: ManagedClusterSupportLevel;
}

const failureDomainKinds = ["provider", "region", "zone", "host"] as const;
const lifecycleStatuses = ["accepting", "draining", "drained", "deleted", "failed"] as const;
const supportLevels = ["community", "standard", "premium"] as const;

function requiredText(value: string | undefined, label: string): Result<string> {
  const normalized = value?.trim();
  return normalized ? ok(normalized) : err(domainError.validation(`${label} is required`));
}

function uniqueTextList(values: readonly string[], label: string): Result<string[]> {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const parsed = requiredText(value, label);
    if (parsed.isErr()) return err(parsed.error);
    if (seen.has(parsed.value)) {
      return err(domainError.validation(`${label} must not contain duplicates`));
    }
    seen.add(parsed.value);
    normalized.push(parsed.value);
  }
  return ok(normalized.sort((left, right) => left.localeCompare(right)));
}

function parseFailureDomains(
  values: readonly ManagedClusterFailureDomainSnapshot[],
): Result<ManagedClusterFailureDomainSnapshot[]> {
  if (values.length === 0) {
    return err(domainError.validation("Managed capacity cell failure domains are required"));
  }
  const seenKinds = new Set<ManagedClusterFailureDomainKind>();
  const normalized: ManagedClusterFailureDomainSnapshot[] = [];
  for (const value of values) {
    if (!(failureDomainKinds as readonly string[]).includes(value.kind)) {
      return err(
        domainError.validation(`Unsupported managed capacity cell failure domain ${value.kind}`),
      );
    }
    if (seenKinds.has(value.kind)) {
      return err(
        domainError.validation("Managed capacity cell failure domain kinds must be unique"),
      );
    }
    const key = requiredText(value.key, "Managed capacity cell failure domain key");
    if (key.isErr()) return err(key.error);
    seenKinds.add(value.kind);
    normalized.push({ kind: value.kind, key: key.value });
  }
  return ok(normalized.sort((left, right) => left.kind.localeCompare(right.kind)));
}

export class ManagedCapacityCell {
  private constructor(private snapshot: ManagedCapacityCellSnapshot) {}

  static create(input: ManagedCapacityCellSnapshot): Result<ManagedCapacityCell> {
    const clusterRef = requiredText(input.clusterRef, "Managed capacity cell cluster ref");
    if (clusterRef.isErr()) return err(clusterRef.error);
    const targetId = requiredText(input.targetId, "Managed capacity cell target id");
    if (targetId.isErr()) return err(targetId.error);
    const targetPoolId = requiredText(input.targetPoolId, "Managed capacity cell target pool id");
    if (targetPoolId.isErr()) return err(targetPoolId.error);
    const providerKey = requiredText(input.providerKey, "Managed capacity cell provider key");
    if (providerKey.isErr()) return err(providerKey.error);
    const region = requiredText(input.region, "Managed capacity cell region");
    if (region.isErr()) return err(region.error);
    const clusterName = input.clusterName
      ? requiredText(input.clusterName, "Managed capacity cell cluster name")
      : ok<string | undefined>(undefined);
    if (clusterName.isErr()) return err(clusterName.error);
    const failureDomains = parseFailureDomains(input.failureDomains);
    if (failureDomains.isErr()) return err(failureDomains.error);
    const capabilities = uniqueTextList(input.capabilities, "Managed capacity cell capability");
    if (capabilities.isErr()) return err(capabilities.error);
    if (!(lifecycleStatuses as readonly string[]).includes(input.lifecycleStatus)) {
      return err(
        domainError.validation(
          `Unsupported managed capacity cell lifecycle status ${input.lifecycleStatus}`,
        ),
      );
    }
    if (!(supportLevels as readonly string[]).includes(input.supportLevel)) {
      return err(
        domainError.validation(`Unsupported managed cluster support level ${input.supportLevel}`),
      );
    }
    if (!Number.isInteger(input.availableCapacity) || input.availableCapacity < 0) {
      return err(
        domainError.validation(
          "Managed capacity cell available capacity must be a non-negative integer",
        ),
      );
    }
    if (!Number.isInteger(input.activePlacementCount) || input.activePlacementCount < 0) {
      return err(
        domainError.validation(
          "Managed capacity cell active placement count must be a non-negative integer",
        ),
      );
    }
    if (
      input.estimatedMonthlyCostUsd !== undefined &&
      (!Number.isFinite(input.estimatedMonthlyCostUsd) || input.estimatedMonthlyCostUsd < 0)
    ) {
      return err(
        domainError.validation("Managed capacity cell estimated cost must be non-negative"),
      );
    }
    if (input.origin === "imported" && input.providerResourceDisposition !== "retain") {
      return err(
        domainError.conflict("Imported managed capacity cells must retain their provider resource"),
      );
    }
    if (input.origin !== "provisioned" && input.origin !== "imported") {
      return err(
        domainError.validation(`Unsupported managed capacity cell origin ${input.origin}`),
      );
    }
    if (!(["delete", "retain"] as const).includes(input.providerResourceDisposition)) {
      return err(
        domainError.validation(
          `Unsupported managed capacity cell provider resource disposition ${input.providerResourceDisposition}`,
        ),
      );
    }
    if (
      input.lifecycleStatus !== "accepting" &&
      input.lifecycleStatus !== "failed" &&
      input.availableCapacity !== 0
    ) {
      return err(
        domainError.invariant(
          "A non-accepting managed capacity cell must expose zero available capacity",
        ),
      );
    }
    if (
      (input.lifecycleStatus === "drained" || input.lifecycleStatus === "deleted") &&
      input.activePlacementCount !== 0
    ) {
      return err(
        domainError.invariant(
          "A drained or deleted managed capacity cell must have zero active placements",
        ),
      );
    }

    return ok(
      new ManagedCapacityCell({
        clusterRef: clusterRef.value,
        targetId: targetId.value,
        targetPoolId: targetPoolId.value,
        providerKey: providerKey.value,
        ...(clusterName.value ? { clusterName: clusterName.value } : {}),
        region: region.value,
        failureDomains: failureDomains.value,
        origin: input.origin,
        lifecycleStatus: input.lifecycleStatus,
        providerResourceDisposition: input.providerResourceDisposition,
        capabilities: capabilities.value,
        availableCapacity: input.availableCapacity,
        activePlacementCount: input.activePlacementCount,
        ...(input.estimatedMonthlyCostUsd !== undefined
          ? { estimatedMonthlyCostUsd: input.estimatedMonthlyCostUsd }
          : {}),
        supportLevel: input.supportLevel,
      }),
    );
  }

  acceptsNewPlacements(): boolean {
    return this.snapshot.lifecycleStatus === "accepting" && this.snapshot.availableCapacity > 0;
  }

  startDrain(): Result<void> {
    if (this.snapshot.lifecycleStatus !== "accepting") {
      return err(
        domainError.conflict("Only an accepting managed capacity cell can start draining", {
          targetId: this.snapshot.targetId,
          lifecycleStatus: this.snapshot.lifecycleStatus,
        }),
      );
    }
    this.snapshot = {
      ...this.snapshot,
      lifecycleStatus: this.snapshot.activePlacementCount === 0 ? "drained" : "draining",
      availableCapacity: 0,
    };
    return ok(undefined);
  }

  recordActivePlacementCount(activePlacementCount: number): Result<void> {
    if (!Number.isInteger(activePlacementCount) || activePlacementCount < 0) {
      return err(
        domainError.validation(
          "Managed capacity cell active placement count must be a non-negative integer",
        ),
      );
    }
    if (this.snapshot.lifecycleStatus === "deleted") {
      return err(
        domainError.conflict("A deleted managed capacity cell cannot record placements", {
          targetId: this.snapshot.targetId,
        }),
      );
    }
    if (
      this.snapshot.lifecycleStatus === "draining" &&
      activePlacementCount > this.snapshot.activePlacementCount
    ) {
      return err(
        domainError.conflict("A draining managed capacity cell cannot gain active placements", {
          targetId: this.snapshot.targetId,
          activePlacementCount,
        }),
      );
    }
    if (this.snapshot.lifecycleStatus === "drained" && activePlacementCount !== 0) {
      return err(
        domainError.conflict("A drained managed capacity cell cannot gain active placements", {
          targetId: this.snapshot.targetId,
          activePlacementCount,
        }),
      );
    }
    this.snapshot = {
      ...this.snapshot,
      activePlacementCount,
      ...(this.snapshot.lifecycleStatus === "draining" && activePlacementCount === 0
        ? { lifecycleStatus: "drained" as const }
        : {}),
    };
    return ok(undefined);
  }

  delete(): Result<void> {
    if (this.snapshot.lifecycleStatus !== "drained" || this.snapshot.activePlacementCount !== 0) {
      return err(
        domainError.conflict(
          "Managed capacity cell deletion requires a drained cell with zero active placements",
          {
            targetId: this.snapshot.targetId,
            lifecycleStatus: this.snapshot.lifecycleStatus,
            activePlacementCount: this.snapshot.activePlacementCount,
          },
        ),
      );
    }
    this.snapshot = {
      ...this.snapshot,
      lifecycleStatus: "deleted",
      availableCapacity: 0,
      activePlacementCount: 0,
    };
    return ok(undefined);
  }

  toJSON(): ManagedCapacityCellSnapshot {
    return {
      ...this.snapshot,
      failureDomains: this.snapshot.failureDomains.map((domain) => ({ ...domain })),
      capabilities: [...this.snapshot.capabilities],
    };
  }
}
