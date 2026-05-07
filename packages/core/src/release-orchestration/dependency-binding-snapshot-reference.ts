import { type ResourceBindingTargetName } from "../dependency-resources/resource-binding";
import { domainError } from "../shared/errors";
import { type ResourceBindingId, type ResourceInstanceId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import {
  type ResourceBindingScopeValue,
  type ResourceInjectionModeValue,
  type ResourceInstanceKindValue,
} from "../shared/state-machine";
import { type DescriptionText } from "../shared/text-values";
import { ScalarValueObject } from "../shared/value-object";

export type DeploymentDependencyBindingSnapshotReadiness = "ready" | "blocked";

const dependencyBindingSnapshotReadinessBrand: unique symbol = Symbol(
  "DeploymentDependencyBindingSnapshotReadinessValue",
);
export class DeploymentDependencyBindingSnapshotReadinessValue extends ScalarValueObject<DeploymentDependencyBindingSnapshotReadiness> {
  private [dependencyBindingSnapshotReadinessBrand]!: void;

  private constructor(value: DeploymentDependencyBindingSnapshotReadiness) {
    super(value);
  }

  static ready(): DeploymentDependencyBindingSnapshotReadinessValue {
    return new DeploymentDependencyBindingSnapshotReadinessValue("ready");
  }

  static blocked(): DeploymentDependencyBindingSnapshotReadinessValue {
    return new DeploymentDependencyBindingSnapshotReadinessValue("blocked");
  }

  static rehydrate(
    value: DeploymentDependencyBindingSnapshotReadiness,
  ): DeploymentDependencyBindingSnapshotReadinessValue {
    return new DeploymentDependencyBindingSnapshotReadinessValue(value);
  }

  isReady(): boolean {
    return this.value === "ready";
  }
}

const dependencyRuntimeSecretRefBrand: unique symbol = Symbol(
  "DeploymentDependencyRuntimeSecretRef",
);
export class DeploymentDependencyRuntimeSecretRef extends ScalarValueObject<string> {
  private [dependencyRuntimeSecretRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DeploymentDependencyRuntimeSecretRef> {
    const normalized = value.trim();
    if (!normalized) {
      return err(
        domainError.validation("Dependency runtime secret reference is required", {
          field: "secretRef",
        }),
      );
    }

    return ok(new DeploymentDependencyRuntimeSecretRef(normalized));
  }

  static rehydrate(value: string): DeploymentDependencyRuntimeSecretRef {
    return new DeploymentDependencyRuntimeSecretRef(value.trim());
  }
}

export interface DeploymentDependencyBindingReferenceState {
  bindingId: ResourceBindingId;
  dependencyResourceId: ResourceInstanceId;
  kind: ResourceInstanceKindValue;
  targetName: ResourceBindingTargetName;
  scope: ResourceBindingScopeValue;
  injectionMode: ResourceInjectionModeValue;
  runtimeSecretRef?: DeploymentDependencyRuntimeSecretRef;
  snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue;
  snapshotReadinessReason?: DescriptionText;
}
