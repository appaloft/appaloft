import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import {
  type ManagedClusterPlacementDecisionSnapshot,
  type ManagedClusterSupportLevel,
} from "./managed-cluster-topology";

export type ManagedClusterCapabilityAction =
  | "provision"
  | "inspect"
  | "readiness"
  | "delete"
  | "place"
  | "failover"
  | "recover"
  | "cleanup-orphans";

export type ManagedClusterLifecycleStatus =
  | "planned"
  | "ready"
  | "deleted"
  | "not-found"
  | "failed";

export interface ManagedClusterCapabilityPlanSnapshot {
  action: ManagedClusterCapabilityAction;
  providerKey: string;
  clusterName?: string;
  clusterRef?: string;
  region?: string;
  clusterClass?: string;
  targetPoolId?: string;
  estimatedMonthlyCostUsd?: number;
  currency: "USD";
  supportLevel: ManagedClusterSupportLevel;
  cleanupSupported: boolean;
  requiredCapabilities: string[];
  placement?: ManagedClusterPlacementDecisionSnapshot;
}

export interface ManagedClusterCapabilityReceiptSnapshot {
  operationId: string;
  action: ManagedClusterCapabilityAction;
  providerKey: string;
  clusterRef: string;
  clusterName?: string;
  status: ManagedClusterLifecycleStatus;
  region?: string;
  clusterClass?: string;
  targetPoolId?: string;
  targetId?: string;
  support: {
    level: ManagedClusterSupportLevel;
    reference?: string;
  };
  cost: {
    currency: "USD";
    estimatedMonthlyAmount?: number;
  };
  cleanup: {
    supported: boolean;
    residualOwnedResources: number;
    orphanResourceRefs: string[];
  };
  placement?: ManagedClusterPlacementDecisionSnapshot;
}

function requiredText(value: string | undefined, label: string): Result<string> {
  const normalized = value?.trim();
  return normalized ? ok(normalized) : err(domainError.validation(`${label} is required`));
}

function optionalText(value: string | undefined, label: string): Result<string | undefined> {
  if (value === undefined) return ok(undefined);
  return requiredText(value, label);
}

function uniqueTextList(values: readonly string[], label: string): Result<string[]> {
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) {
    return err(domainError.validation(`${label} must not contain empty values`));
  }
  if (new Set(normalized).size !== normalized.length) {
    return err(domainError.validation(`${label} must not contain duplicates`));
  }
  return ok(normalized.sort((left, right) => left.localeCompare(right)));
}

function validAction(value: string): value is ManagedClusterCapabilityAction {
  return [
    "provision",
    "inspect",
    "readiness",
    "delete",
    "place",
    "failover",
    "recover",
    "cleanup-orphans",
  ].includes(value);
}

function validSupport(value: string): value is ManagedClusterSupportLevel {
  return ["community", "standard", "premium"].includes(value);
}

export class ManagedClusterCapabilityPlan {
  private constructor(private readonly snapshot: ManagedClusterCapabilityPlanSnapshot) {}

  static create(input: ManagedClusterCapabilityPlanSnapshot): Result<ManagedClusterCapabilityPlan> {
    if (!validAction(input.action)) {
      return err(domainError.validation(`Unsupported managed cluster action ${input.action}`));
    }
    const providerKey = requiredText(input.providerKey, "Managed cluster provider key");
    if (providerKey.isErr()) return err(providerKey.error);
    const clusterName = optionalText(input.clusterName, "Managed cluster name");
    if (clusterName.isErr()) return err(clusterName.error);
    const clusterRef = optionalText(input.clusterRef, "Managed cluster ref");
    if (clusterRef.isErr()) return err(clusterRef.error);
    const region = optionalText(input.region, "Managed cluster region");
    if (region.isErr()) return err(region.error);
    const clusterClass = optionalText(input.clusterClass, "Managed cluster class");
    if (clusterClass.isErr()) return err(clusterClass.error);
    const targetPoolId = optionalText(input.targetPoolId, "Managed cluster target pool id");
    if (targetPoolId.isErr()) return err(targetPoolId.error);
    if (
      input.action === "provision" &&
      (!clusterName.value || !region.value || !clusterClass.value || !targetPoolId.value)
    ) {
      return err(
        domainError.validation(
          "Managed cluster provision requires name, region, class, and target pool",
        ),
      );
    }
    if (["inspect", "delete", "cleanup-orphans"].includes(input.action) && !clusterRef.value) {
      return err(domainError.validation(`Managed cluster ${input.action} requires a cluster ref`));
    }
    if (
      input.estimatedMonthlyCostUsd !== undefined &&
      (!Number.isFinite(input.estimatedMonthlyCostUsd) || input.estimatedMonthlyCostUsd < 0)
    ) {
      return err(
        domainError.validation("Managed cluster estimated monthly cost must be non-negative"),
      );
    }
    if (input.currency !== "USD") {
      return err(domainError.validation("Managed cluster plan currency must be USD"));
    }
    if (!validSupport(input.supportLevel)) {
      return err(
        domainError.validation(`Unsupported managed cluster support level ${input.supportLevel}`),
      );
    }
    const requiredCapabilities = uniqueTextList(
      input.requiredCapabilities,
      "Managed cluster required capabilities",
    );
    if (requiredCapabilities.isErr()) return err(requiredCapabilities.error);

    return ok(
      new ManagedClusterCapabilityPlan({
        action: input.action,
        providerKey: providerKey.value,
        ...(clusterName.value ? { clusterName: clusterName.value } : {}),
        ...(clusterRef.value ? { clusterRef: clusterRef.value } : {}),
        ...(region.value ? { region: region.value } : {}),
        ...(clusterClass.value ? { clusterClass: clusterClass.value } : {}),
        ...(targetPoolId.value ? { targetPoolId: targetPoolId.value } : {}),
        ...(input.estimatedMonthlyCostUsd !== undefined
          ? { estimatedMonthlyCostUsd: input.estimatedMonthlyCostUsd }
          : {}),
        currency: "USD",
        supportLevel: input.supportLevel,
        cleanupSupported: input.cleanupSupported,
        requiredCapabilities: requiredCapabilities.value,
        ...(input.placement ? { placement: input.placement } : {}),
      }),
    );
  }

  toJSON(): ManagedClusterCapabilityPlanSnapshot {
    return {
      ...this.snapshot,
      requiredCapabilities: [...this.snapshot.requiredCapabilities],
      ...(this.snapshot.placement ? { placement: clonePlacement(this.snapshot.placement) } : {}),
    };
  }
}

export class ManagedClusterCapabilityReceipt {
  private constructor(private readonly snapshot: ManagedClusterCapabilityReceiptSnapshot) {}

  static create(
    input: ManagedClusterCapabilityReceiptSnapshot,
  ): Result<ManagedClusterCapabilityReceipt> {
    const operationId = requiredText(input.operationId, "Managed cluster operation id");
    if (operationId.isErr()) return err(operationId.error);
    if (!validAction(input.action)) {
      return err(domainError.validation(`Unsupported managed cluster action ${input.action}`));
    }
    const providerKey = requiredText(input.providerKey, "Managed cluster provider key");
    if (providerKey.isErr()) return err(providerKey.error);
    const clusterRef = requiredText(input.clusterRef, "Managed cluster ref");
    if (clusterRef.isErr()) return err(clusterRef.error);
    if (!["planned", "ready", "deleted", "not-found", "failed"].includes(input.status)) {
      return err(domainError.validation(`Unsupported managed cluster status ${input.status}`));
    }
    if (!validSupport(input.support.level)) {
      return err(
        domainError.validation(`Unsupported managed cluster support level ${input.support.level}`),
      );
    }
    if (input.cost.currency !== "USD") {
      return err(domainError.validation("Managed cluster receipt currency must be USD"));
    }
    if (
      input.cost.estimatedMonthlyAmount !== undefined &&
      (!Number.isFinite(input.cost.estimatedMonthlyAmount) || input.cost.estimatedMonthlyAmount < 0)
    ) {
      return err(domainError.validation("Managed cluster receipt cost must be non-negative"));
    }
    if (
      !Number.isInteger(input.cleanup.residualOwnedResources) ||
      input.cleanup.residualOwnedResources < 0
    ) {
      return err(
        domainError.validation(
          "Managed cluster residual resource count must be a non-negative integer",
        ),
      );
    }
    const orphanResourceRefs = uniqueTextList(
      input.cleanup.orphanResourceRefs,
      "Managed cluster orphan refs",
    );
    if (orphanResourceRefs.isErr()) return err(orphanResourceRefs.error);
    if (
      input.status === "deleted" &&
      (input.cleanup.residualOwnedResources !== 0 || orphanResourceRefs.value.length !== 0)
    ) {
      return err(
        domainError.conflict("Deleted managed cluster receipt must prove zero residual resources"),
      );
    }

    return ok(
      new ManagedClusterCapabilityReceipt({
        ...input,
        operationId: operationId.value,
        providerKey: providerKey.value,
        clusterRef: clusterRef.value,
        support: { ...input.support },
        cost: { ...input.cost },
        cleanup: { ...input.cleanup, orphanResourceRefs: orphanResourceRefs.value },
        ...(input.placement ? { placement: clonePlacement(input.placement) } : {}),
      }),
    );
  }

  toJSON(): ManagedClusterCapabilityReceiptSnapshot {
    return {
      ...this.snapshot,
      support: { ...this.snapshot.support },
      cost: { ...this.snapshot.cost },
      cleanup: {
        ...this.snapshot.cleanup,
        orphanResourceRefs: [...this.snapshot.cleanup.orphanResourceRefs],
      },
      ...(this.snapshot.placement ? { placement: clonePlacement(this.snapshot.placement) } : {}),
    };
  }
}

function clonePlacement(
  input: ManagedClusterPlacementDecisionSnapshot,
): ManagedClusterPlacementDecisionSnapshot {
  return {
    ...input,
    rankedEligibleTargetIds: [...input.rankedEligibleTargetIds],
    reasonCodes: [...input.reasonCodes],
    ...(input.selectedFailureDomains
      ? {
          selectedFailureDomains: input.selectedFailureDomains.map((domain) => ({ ...domain })),
        }
      : {}),
    consideredTargets: input.consideredTargets.map((target) => ({
      ...target,
      reasons: [...target.reasons],
    })),
  };
}
