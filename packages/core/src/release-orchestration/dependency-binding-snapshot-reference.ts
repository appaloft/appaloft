import { type ResourceBindingTargetName } from "../dependency-resources/resource-binding";
import { type ResourceBindingId, type ResourceInstanceId } from "../shared/identifiers";
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

export interface DeploymentDependencyBindingReferenceState {
  bindingId: ResourceBindingId;
  dependencyResourceId: ResourceInstanceId;
  kind: ResourceInstanceKindValue;
  targetName: ResourceBindingTargetName;
  scope: ResourceBindingScopeValue;
  injectionMode: ResourceInjectionModeValue;
  snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue;
  snapshotReadinessReason?: DescriptionText;
}
