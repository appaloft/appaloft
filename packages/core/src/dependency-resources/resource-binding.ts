import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type EnvironmentId,
  type ResourceBindingId,
  type ResourceInstanceId,
  type WorkloadId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import {
  type ResourceBindingScopeValue,
  type ResourceInjectionModeValue,
} from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import { type AliasText } from "../shared/text-values";

export interface ResourceBindingState {
  id: ResourceBindingId;
  workloadId: WorkloadId;
  resourceInstanceId: ResourceInstanceId;
  environmentId: EnvironmentId;
  alias: AliasText;
  scope: ResourceBindingScopeValue;
  injectionMode: ResourceInjectionModeValue;
  createdAt: CreatedAt;
}

export class ResourceBinding extends AggregateRoot<ResourceBindingState> {
  private constructor(state: ResourceBindingState) {
    super(state);
  }

  static create(input: ResourceBindingState): Result<ResourceBinding> {
    if (input.scope.value === "build-only" && input.injectionMode.value === "reference") {
      return err(
        domainError.validation("Build-only resource bindings cannot use runtime references"),
      );
    }

    const binding = new ResourceBinding(input);
    binding.recordDomainEvent("resource.binding_created", input.createdAt, {
      scope: input.scope.value,
      injectionMode: input.injectionMode.value,
    });
    return ok(binding);
  }

  static rehydrate(state: ResourceBindingState): ResourceBinding {
    return new ResourceBinding(state);
  }

  toState(): ResourceBindingState {
    return { ...this.state };
  }
}
